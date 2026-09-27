import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { ServiceSessionSnapshotSchema } from '@zerospin/core/serviceSession/ServiceActorCommandSchema';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import type { IServiceSessionSnapshot } from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  encodeError,
  mapParseError,
  ZerospinErrorSchema,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  makeRpcEnvelope,
  makeSpanLinkId,
  TelemetryBatchSchema,
  type IRpcEnvelope,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { Effect, Exit, Result, Schema } from 'effect';

import { ServiceActorVersionRepo } from '../../ServiceActorVersionRepo/ServiceActorVersionRepo.js';
import { ServiceChain } from '../../ServiceChain/ServiceChain.js';
import { ServiceVersionRepo } from '../../ServiceVersionRepo/ServiceVersionRepo.js';
import { SystemLogRepo } from '../../SystemLogRepo/SystemLogRepo.js';

import { encodeServiceSessionResource } from './encodeServiceSessionResource/encodeServiceSessionResource.js';

/*
 * The service definition capability requests its snapshot from
 * ServiceActorVersionRepo and adapts resources to the exact
 * definition selection. The materializer owns catch-up and definition snapshot.
 *
 * 1. Validate the request arguments.
 * 2. Return invalid arguments immediately.
 * 3. Collect the operation under the API root span.
 * 4. Resolve the canonical definition materializer.
 * 5. Read and validate the materializer RPC result.
 * 6. Adapt resources to the admitted model versions.
 * 7. Return adapted resources with canonical progress.
 * 8. Encode the settled domain outcome.
 * 9. Persist telemetry and determine the trace link.
 * 10. Return the linked RPC envelope.
 */
export const getSnapshot = Effect.fn('ServiceSessionApi.getSnapshot')(
  function* (props: {
    request: IRpcRequest<[]>;
    authResults: {
      readonly identity: Readonly<Record<string, unknown>>;
      readonly actorPath: string;
      readonly sessionName: string;
      readonly serviceSessionLock: IServiceSessionLock;
      readonly serviceName: string;
      serviceVersion: string;
      readonly systemId: ISystemId;
    };
  }) {
    const { authResults, request } = props;

    // 1 — decode request.args and reject excess fields
    const validatedArgs = yield* Schema.decodeUnknownEffect(
      Schema.toType(Schema.mutable(Schema.Tuple([]))),
    )(request.args, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-session-api-arguments-invalid',
        prefix: 'ServiceSessionApi.getSnapshot received invalid arguments',
      }),
      Effect.result,
    );

    // 2 — encode the validation failure with a null trace link
    if (Result.isFailure(validatedArgs)) {
      return {
        result: yield* encodeError(validatedArgs.failure).pipe(
          Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
        ),
        link: null,
      };
    }

    // 3 — collect and settle the operation under the API root span
    const settled = yield* Effect.gen(function* () {
      const {
        sessionName,
        serviceSessionLock,
        serviceName,
        identity,
        actorPath,
      } = authResults;

      // 4 — open ServiceActorVersionRepo with the supplied view fields
      const serviceVersion = authResults.serviceVersion;
      const admitted = yield* ServiceChain.getRepo({
        key: { systemId: authResults.systemId, serviceName },
      });
      const queue = yield* makeAsync(() => admitted.admissionResultsFanout);
      const inputs = yield* makeAsync(() =>
        queue.getPage({ afterIndex: 0, maxIndex: 0 }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
      const serviceRepo = yield* ServiceVersionRepo.getRepo({
        key: { systemId: env.ZEROSPIN_SYSTEM_ID, serviceName, serviceVersion },
      });
      yield* makeAsync(() => serviceRepo.flush(inputs.lastIndex)).pipe(
        Effect.flatMap(envelope => readRpcEnvelope(envelope)),
      );
      const serviceSessionRepo = yield* ServiceActorVersionRepo.getRepo({
        key: {
          systemId: env.ZEROSPIN_SYSTEM_ID,
          serviceName,
          serviceVersion,
          actorPath,
          actorName: serviceSessionLock.actorName,
          actorVersion: serviceSessionLock.actorVersion,
        },
      });

      // 5 — decode the success snapshot or encoded ZerospinError before readRpcEnvelope
      const canonicalSnapshotUnknown = yield* makeAsync(() =>
        serviceSessionRepo.getSnapshot({
          serviceName,
          actorPath,
          actorName: serviceSessionLock.actorName,
          actorVersion: serviceSessionLock.actorVersion,
        }),
      );
      const canonicalSnapshotEncoded = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          result: Schema.Union([
            Schema.Struct({
              _tag: Schema.Literal('Success'),
              success: Schema.toType(
                ServiceSessionSnapshotSchema.mapFields(
                  ({
                    identity: _identity,
                    sessionName: _sessionName,
                    ...fields
                  }) => ({
                    ...fields,
                    actorPath: Schema.String,
                    actorName: Schema.String,
                    actorVersion: Schema.String,
                  }),
                ),
              ),
            }),
            Schema.Struct({
              _tag: Schema.Literal('Failure'),
              failure: Schema.toEncoded(ZerospinErrorSchema),
            }),
          ]),
          telemetry: TelemetryBatchSchema,
        }),
      )(canonicalSnapshotUnknown).pipe(
        mapParseError({
          code: 'service-session-snapshot-rpc-invalid',
          prefix: 'Failed to decode ServiceActorVersionRepo snapshot RPC',
        }),
      );
      const canonicalSnapshot = yield* readRpcEnvelope(
        canonicalSnapshotEncoded,
      );

      // 6 — skip models absent from the lock and validate each adapted encoded resource
      const resources: IServiceSessionSnapshot['resources'][number][] = [];
      for (const resource of canonicalSnapshot.resources) {
        const requestedModel = Object.values(serviceSessionLock.models).find(
          model => model.modelName === resource.modelName,
        );
        if (requestedModel === undefined) {
          continue;
        }
        const adaptedUnknown = yield* encodeServiceSessionResource({
          serviceName,
          serviceVersion: authResults.serviceVersion,
          sessionName,
          modelName: resource.modelName,
          modelVersion: requestedModel.version,
          resource,
        });
        const adapted = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            modelName: Schema.String,
            resource: EncodedResourceSchema,
          }),
        )(adaptedUnknown, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'service-session-resource-adaptation-result-invalid',
            prefix:
              'The static System returned an invalid adapted service definition resource',
          }),
        );
        resources.push(adapted.resource);
      }

      // 7 — retain the snapshot cursor and full identity
      return {
        serviceName: canonicalSnapshot.serviceName,
        serviceVersion: canonicalSnapshot.serviceVersion,
        actorName: canonicalSnapshot.actorName,
        actorVersion: canonicalSnapshot.actorVersion,
        serviceIndex: canonicalSnapshot.serviceIndex,
        serviceHash: canonicalSnapshot.serviceHash,
        sessionName,
        identity,
        resources,
      };
    }).pipe(
      Effect.withSpan('ServiceSessionApi.getSnapshot', { root: true }),
      makeRpcEnvelope,
    );

    // 8 — preserve success or typed failure before attempting telemetry persistence
    const result = settled.result;

    // 9 — emit a link only after persistence succeeds and the root span matches this method
    const batch = settled.telemetry;
    const persisted = yield* Effect.gen(function* () {
      const systemLogRepo = yield* SystemLogRepo.getRepo({
        key: { systemId: authResults.systemId },
      });
      return yield* makeAsync<IRpcEnvelope<void, IZerospinErrorJson>>(() =>
        systemLogRepo.appendTelemetryBatch({
          batch,
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
    }).pipe(Effect.exit);
    const rootSpan = batch.spans.at(-1);
    const link: ISpanLinkRecord | null =
      Exit.isSuccess(persisted) &&
      request.traceContext !== null &&
      rootSpan !== undefined &&
      rootSpan.parentSpanId === null &&
      rootSpan.name === 'ServiceSessionApi.getSnapshot'
        ? {
            linkId: makeSpanLinkId(),
            traceId: rootSpan.traceId,
            spanId: rootSpan.spanId,
            priorTraceId: request.traceContext.traceId,
            priorSpanId: request.traceContext.parentSpanId,
            kind: 'causedBy',
          }
        : null;

    // 10 — return the domain result even when no trace link can be emitted
    return { result, link };
  },
);
