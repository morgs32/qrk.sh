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

import { getMaterializedAggregateFrontendRepo } from '../../MaterializedAggregateFrontendRepo/getMaterializedAggregateFrontendRepo/getMaterializedAggregateFrontendRepo.js';
import { getSystemLogRepo } from '../../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';

export const getState = Effect.fn('AggregateFrontendApi.getState')(
  function* (props: {
    request: IRpcRequest<[]>;
    authResults: {
      readonly aggregateId: IAggregateId;
      readonly aggregateName: string;
      readonly userId: string;
      readonly frontendName: string;
      readonly aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
      readonly systemId: ISystemId;
    };
  }) {
    const { authResults, request } = props;
    const validatedArgs = yield* Schema.decodeUnknownEffect(
      Schema.toType(Schema.mutable(Schema.Tuple([]))),
    )(request.args, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-api-arguments-invalid',
        prefix: 'AggregateFrontendApi.getState received invalid arguments',
      }),
      Effect.result,
    );
    if (Result.isFailure(validatedArgs)) {
      return {
        result: yield* encodeRpc(Effect.fail(validatedArgs.failure)),
        link: null,
      };
    }

    const aggregateFrontendRepo = yield* getMaterializedAggregateFrontendRepo({
      key: {
        systemId: authResults.systemId,
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
        userId: authResults.userId,
        frontendName: authResults.frontendName,
      },
    });
    const collector = makeTelemetryCollector();
    const settled = yield* makeAsync<
      IEncodedResult<IAggregateFrontendSyncState, IAnyErrorJson>
    >(() =>
      aggregateFrontendRepo.getState({
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
        userId: authResults.userId,
        frontendName: authResults.frontendName,
      }),
    ).pipe(
      Effect.flatMap(decodeRpc),
      Effect.withSpan('AggregateFrontendApi.getState', { root: true }),
      Effect.provide(makeTelemetryLayer(collector)),
      Effect.result,
    );
    const result = yield* Result.match(settled, {
      onFailure: error => encodeRpc(Effect.fail(error)),
      onSuccess: value => encodeRpc(Effect.succeed(value)),
    });

    const batch = collector.flush();
    const persisted = yield* Effect.gen(function* () {
      const systemLogRepo = yield* getSystemLogRepo({
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
    return { result, link };
  },
);
