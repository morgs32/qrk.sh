import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
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
import { Effect, Result, Schema } from 'effect';

import { SystemLogRepo } from '../../SystemLogRepo/SystemLogRepo.js';
import { UserVersionedAggregateRepo } from '../../UserVersionedAggregateRepo/UserVersionedAggregateRepo.js';

/*
 * The aggregate frontend capability requests its admitted version from UVAR,
 * reconciles outstanding outcomes, and filters the shared user graph by its lock.
 *
 * 1. Validate the request arguments.
 * 2. Return invalid arguments immediately.
 * 3. Resolve the admitted aggregate owner.
 * 4. Select the admitted version and its shared user replica.
 * 5. Collect and settle the domain operation.
 * 6. Encode the settled domain outcome.
 * 7. Persist telemetry and determine the trace link.
 * 8. Return the linked RPC envelope.
 */
export const getState = Effect.fn('AggregateFrontendApi.getState')(
  function* (props: {
    request: IRpcRequest<[{ outstandingCommandIds: readonly string[] }]>;
    authResults: {
      readonly aggregateId: IAggregateId;
      readonly aggregateName: string;
      aggregateVersion: string;
      readonly userId: string;
      readonly frontendName: string;
      readonly aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
      readonly systemId: ISystemId;
    };
  }) {
    const { authResults, request } = props;

    // 1 — decode request.args and reject excess fields
    const validatedArgs = yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.mutable(
          Schema.Tuple([
            Schema.Struct({
              outstandingCommandIds: Schema.Array(Schema.String),
            }),
          ]),
        ),
      ),
    )(request.args, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-api-arguments-invalid',
        prefix: 'AggregateFrontendApi.getState received invalid arguments',
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

    // 3 — bind systemId, aggregateId, and aggregateName from the capability
    const aggregateVersion = authResults.aggregateVersion;
    const aggregateFrontendRepo = yield* UserVersionedAggregateRepo.getRepo({
      key: {
        systemId: authResults.systemId,
        aggregateVersion,
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
        userId: authResults.userId,
      },
    });

    // 5 — settle the materializer getState RPC under a collected root span
    const collector = makeTelemetryCollector();
    const settled = yield* makeAsync<
      IEncodedResult<IAggregateFrontendSyncState, IAnyErrorJson>
    >(() =>
      aggregateFrontendRepo.getState({
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
        userId: authResults.userId,
        frontendName: authResults.frontendName,
        outstandingCommandIds: validatedArgs.success[0].outstandingCommandIds,
      }),
    ).pipe(
      Effect.flatMap(decodeRpc),
      Effect.map(state => ({
        ...state,
        resources: state.resources.filter(resource =>
          Object.hasOwn(
            authResults.aggregateFrontendLock.models,
            resource.modelName,
          ),
        ),
      })),
      Effect.withSpan('AggregateFrontendApi.getState', { root: true }),
      Effect.provide(makeTelemetryLayer(collector)),
      Effect.result,
    );

    // 6 — preserve success or typed failure before attempting telemetry persistence
    const result = yield* Result.match(settled, {
      onFailure: error => encodeRpc(Effect.fail(error)),
      onSuccess: value => encodeRpc(Effect.succeed(value)),
    });

    // 7 — emit a link only after persistence succeeds and the root span matches this method
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
      rootSpan.name === 'AggregateFrontendApi.getState'
        ? {
            linkId: makeSpanLinkId(),
            traceId: rootSpan.traceId,
            spanId: rootSpan.spanId,
            priorTraceId: request.traceContext.traceId,
            priorSpanId: request.traceContext.parentSpanId,
            kind: 'causedBy',
          }
        : null;

    // 8 — return the domain result even when no trace link can be emitted
    return { result, link };
  },
);
