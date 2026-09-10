import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { ServiceFrontendStateSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
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
import { Effect, Result, Schema } from 'effect';

import { FrontendVersionedServiceRepo } from '../../FrontendVersionedServiceRepo/FrontendVersionedServiceRepo.js';
import { ServiceAdmittedChain } from '../../ServiceAdmittedChain/ServiceAdmittedChain.js';
import { adaptFrontendResource } from '../../StaticSystem/adaptFrontendResource/adaptFrontendResource.js';
import { SelectedServiceFrontendLockSchema } from '../../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';
import { SystemLogRepo } from '../../SystemLogRepo/SystemLogRepo.js';
import { VersionedServiceRepo } from '../../VersionedServiceRepo/VersionedServiceRepo.js';

/*
 * The service frontend capability requests its snapshot from
 * FrontendVersionedServiceRepo and adapts resources to the exact
 * frontend selection. The materializer owns catch-up and frontend state.
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
export const getState = Effect.fn('ServiceFrontendApi.getState')(
  function* (props: {
    request: IRpcRequest<[]>;
    authResults: {
      readonly userId: string;
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
        prefix: 'ServiceFrontendApi.getState received invalid arguments',
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
      const { frontendName, serviceFrontendLock, serviceName, userId } =
        authResults;

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
          userId,
          frontendName,
        },
      });

      // 7 — decode the success snapshot or encoded ZerospinError before decodeRpc
      const canonicalStateUnknown = yield* makeAsync(() =>
        serviceFrontendRepo.getState({
          serviceName,
          userId,
          frontendName,
        }),
      );
      const canonicalStateEncoded = yield* Schema.decodeUnknownEffect(
        Schema.Union([
          Schema.Struct({
            _tag: Schema.Literal('Success'),
            success: Schema.toType(ServiceFrontendStateSchema),
          }),
          Schema.Struct({
            _tag: Schema.Literal('Failure'),
            failure: Schema.toEncoded(ZerospinError.schema),
          }),
        ]),
      )(canonicalStateUnknown).pipe(
        mapParseError({
          code: 'service-frontend-state-rpc-invalid',
          prefix: 'Failed to decode FrontendVersionedServiceRepo state RPC',
        }),
      );
      const canonicalState = yield* decodeRpc(canonicalStateEncoded);

      // 8 — skip models absent from the lock and validate each adapted encoded resource
      const resources: IServiceFrontendState['resources'][number][] = [];
      for (const resource of canonicalState.resources) {
        const requestedModel = Object.values(
          selected.serviceFrontendLock.models,
        ).find(model => model.modelName === resource.modelName);
        if (requestedModel === undefined) {
          continue;
        }
        const adaptedUnknown = yield* adaptFrontendResource({
          owner: {
            kind: 'service',
            serviceName,
            serviceVersion: authResults.serviceVersion,
          },
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

      // 9 — retain the snapshot cursor and identity
      return {
        ...canonicalState,
        resources,
      };
    }).pipe(
      Effect.withSpan('ServiceFrontendApi.getState', { root: true }),
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
      rootSpan.name === 'ServiceFrontendApi.getState'
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
