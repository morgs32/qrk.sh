import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { ServiceFrontendSnapshotSchema } from '@zerospin/core/serviceSession/ServiceSelectedCommandSchema';
import type { IServiceFrontendSnapshot } from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import config from 'config';
import { Effect, Result, Schema } from 'effect';

import { FrontendVersionedServiceRepo } from '../../FrontendVersionedServiceRepo/FrontendVersionedServiceRepo.js';
import { ServiceAdmittedChain } from '../../ServiceAdmittedChain/ServiceAdmittedChain.js';
import { adaptServiceFrontendResource } from '../../StaticSystem/adaptServiceFrontendResource/adaptServiceFrontendResource.js';
import { SelectedServiceFrontendLockSchema } from '../../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';
import { SystemLogRepo } from '../../SystemLogRepo/SystemLogRepo.js';
import { VersionedServiceRepo } from '../../VersionedServiceRepo/VersionedServiceRepo.js';

/*
 * The service frontend capability requests its snapshot from
 * FrontendVersionedServiceRepo and adapts resources to the exact
 * frontend selection. The materializer owns catch-up and frontend snapshot.
 *
 * 1. Validate the request arguments.
 * 2. Return invalid arguments immediately.
 * 3. Collect the operation under the API root span.
 * 4. Validate the selected frontend lock.
 * 5. Decode the selected lock result.
 * 6. Resolve the canonical frontend materializer.
 * 7. Read and validate the materializer RPC result.
 * 8. Adapt resources to the selected model versions.
 * 9. Return adapted resources with canonical progress.
 * 10. Encode the settled domain outcome.
 * 11. Persist telemetry and determine the trace link.
 * 12. Return the linked RPC envelope.
 */
export const getSnapshot = Effect.fn('ServiceFrontendApi.getSnapshot')(
  function* (props: {
    request: IRpcRequest<[]>;
    authResults: {
      readonly authentication: Readonly<Record<string, unknown>>;
      readonly selectionPath: string;
      readonly frontendName: string;
      readonly serviceFrontendLock: Schema.Schema.Type<
        typeof ServiceFrontendLockSchema
      >;
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
        code: 'service-frontend-api-arguments-invalid',
        prefix: 'ServiceFrontendApi.getSnapshot received invalid arguments',
      }),
      Effect.result,
    );

    // 2 — encode the validation failure with a null trace link
    if (Result.isFailure(validatedArgs)) {
      return {
        result: yield* encodeRpc(Effect.fail(validatedArgs.failure)),
        link: null,
      };
    }

    // 3 — collect and settle the operation under the API root span
    const collector = makeTelemetryCollector();
    const settled = yield* Effect.gen(function* () {
      const {
        frontendName,
        serviceFrontendLock,
        serviceName,
        authentication,
        selectionPath,
      } = authResults;

      // 4 — resolve the authored service frontend selection
      const selectedUnknown = yield* validateServiceFrontendLock({
        serviceVersion: authResults.serviceVersion,
        serviceName,
        frontendName,
        serviceFrontendLock,
      });

      // 5 — check SelectedServiceFrontendLockSchema before adapting resources
      const selected = yield* Schema.decodeUnknownEffect(
        SelectedServiceFrontendLockSchema,
      )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'system-runtime-service-frontend-lock-invalid',
          prefix: 'The static System returned an invalid selected lock',
        }),
      );

      // 6 — open FrontendVersionedServiceRepo with the supplied view fields
      const serviceVersion = authResults.serviceVersion;
      const admitted = yield* ServiceAdmittedChain.getRepo({
        key: { systemId: authResults.systemId, serviceName },
      });
      const queue = yield* makeAsync(() => admitted.serviceFanoutQueue);
      const inputs = yield* makeAsync(() =>
        queue.getPage({ afterIndex: 0, maxIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      const serviceRepo = yield* VersionedServiceRepo.getRepo({
        key: { systemId: env.ZEROSPIN_SYSTEM_ID, serviceName, serviceVersion },
      });
      yield* makeAsync(() => serviceRepo.flush(inputs.lastIndex)).pipe(
        Effect.flatMap(decodeRpc),
      );
      const serviceFrontendRepo = yield* FrontendVersionedServiceRepo.getRepo({
        key: {
          systemId: env.ZEROSPIN_SYSTEM_ID,
          serviceName,
          serviceVersion,
          selectionPath,
          frontendName,
        },
      });

      // 7 — decode the success snapshot or encoded ZerospinError before decodeRpc
      const canonicalSnapshotUnknown = yield* makeAsync(() =>
        serviceFrontendRepo.getSnapshot({
          serviceName,
          selectionPath,
          frontendName,
        }),
      );
      const canonicalSnapshotEncoded = yield* Schema.decodeUnknownEffect(
        Schema.Union([
          Schema.Struct({
            _tag: Schema.Literal('Success'),
            success: Schema.toType(
              ServiceFrontendSnapshotSchema.mapFields(
                ({ authentication: _authentication, ...fields }) => ({
                  ...fields,
                  selectionPath: Schema.String,
                }),
              ),
            ),
          }),
          Schema.Struct({
            _tag: Schema.Literal('Failure'),
            failure: Schema.toEncoded(ZerospinError.schema),
          }),
        ]),
      )(canonicalSnapshotUnknown).pipe(
        mapParseError({
          code: 'service-frontend-snapshot-rpc-invalid',
          prefix: 'Failed to decode FrontendVersionedServiceRepo snapshot RPC',
        }),
      );
      const canonicalSnapshot = yield* decodeRpc(canonicalSnapshotEncoded);

      // 8 — skip models absent from the lock and validate each adapted encoded resource
      const resources: IServiceFrontendSnapshot['resources'][number][] = [];
      for (const resource of canonicalSnapshot.resources) {
        const requestedModel = Object.values(
          selected.serviceFrontendLock.models,
        ).find(model => model.modelName === resource.modelName);
        if (requestedModel === undefined) {
          continue;
        }
        const adaptedUnknown = yield* adaptServiceFrontendResource({
          serviceName,
          serviceVersion: authResults.serviceVersion,
          frontendName,
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
            code: 'service-frontend-resource-adaptation-result-invalid',
            prefix:
              'The static System returned an invalid adapted service frontend resource',
          }),
        );
        resources.push(adapted.resource);
      }

      const service = yield* getByKeyOrThrow({
        record: config.system.services[serviceName] ?? {},
        key: serviceVersion,
        recordKind: 'service versions',
      });
      const decodedAuthentication = yield* Schema.decodeUnknownEffect(
        service.authentication.authenticationSchema,
      )(authentication).pipe(
        mapParseError({
          code: 'frontend-authentication-invalid',
          prefix: 'Invalid saved authentication',
        }),
      );
      // 9 — retain the snapshot cursor and full authentication
      const { selectionPath: _replicaSelectionPath, ...snapshot } =
        canonicalSnapshot;
      return {
        ...snapshot,
        authentication: decodedAuthentication,
        resources,
      };
    }).pipe(
      Effect.withSpan('ServiceFrontendApi.getSnapshot', { root: true }),
      Effect.provide(makeTelemetryLayer(collector)),
      Effect.result,
    );

    // 10 — preserve success or typed failure before attempting telemetry persistence
    const result = yield* Result.match(settled, {
      onFailure: error => encodeRpc(Effect.fail(error)),
      onSuccess: value => encodeRpc(Effect.succeed(value)),
    });

    // 11 — emit a link only after persistence succeeds and the root span matches this method
    const batch = collector.flush();
    const persisted = yield* Effect.gen(function* () {
      const systemLogRepo = yield* SystemLogRepo.getRepo({
        key: { systemId: authResults.systemId },
      });
      return yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
        systemLogRepo.appendTelemetryBatch({
          batch,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
    }).pipe(Effect.result);
    const rootSpan = batch.spans.at(-1);
    const link: ISpanLinkRecord | null =
      Result.isSuccess(persisted) &&
      request.traceContext !== null &&
      rootSpan !== undefined &&
      rootSpan.parentSpanId === null &&
      rootSpan.name === 'ServiceFrontendApi.getSnapshot'
        ? {
            linkId: makeSpanLinkId(),
            traceId: rootSpan.traceId,
            spanId: rootSpan.spanId,
            priorTraceId: request.traceContext.traceId,
            priorSpanId: request.traceContext.parentSpanId,
            kind: 'causedBy',
          }
        : null;

    // 12 — return the domain result even when no trace link can be emitted
    return { result, link };
  },
);
