import type { IUserRef } from '@zerospin/core/aggregate/types';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { mapParseError } from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Effect, Either, Schema } from 'effect';

import { SystemWorkerResolver } from '../../SystemWorkerResolver/SystemWorkerResolver.js';

export const getState = Effect.fn('AggregateFrontendApi.getState')(
  function* (props: {
    request: IRpcRequest<[]>;
    authResults: {
      readonly actorRef: IUserRef;
      readonly frontendName: string;
      readonly aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
      readonly generationId: string;
      readonly systemId: ISystemId;
      readonly systemWorkerName: string;
    };
  }) {
    const validatedArgs = yield* Schema.validate(
      Schema.mutable(Schema.Tuple()),
    )(props.request.args, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-api-arguments-invalid',
        prefix: 'AggregateFrontendApi.getState received invalid arguments',
      }),
      Effect.either,
    );
    if (Either.isLeft(validatedArgs)) {
      return {
        result: yield* encodeRpc(Effect.fail(validatedArgs.left)),
        link: null,
      };
    }

    const resolver = yield* SystemWorkerResolver;
    using systemWorker = resolver.get({
      systemWorkerName: props.authResults.systemWorkerName,
    });
    const collector = makeTelemetryCollector();
    const settled = yield* makeAsync(() =>
      systemWorker.getAggregateFrontendState({
        actorRef: props.authResults.actorRef,
        aggregateFrontendLock: props.authResults.aggregateFrontendLock,
        frontendName: props.authResults.frontendName,
        generationId: props.authResults.generationId,
      }),
    ).pipe(
      Effect.flatMap(decodeRpc),
      Effect.withSpan('AggregateFrontendApi.getState', { root: true }),
      Effect.provide(makeTelemetryLayer(collector)),
      Effect.either,
    );
    const result = yield* Either.match(settled, {
      onLeft: error => encodeRpc(Effect.fail(error)),
      onRight: value => encodeRpc(Effect.succeed(value)),
    });

    const batch = collector.flush();
    const persisted = yield* makeAsync(() =>
      systemWorker.appendTelemetryBatch({
        batch,
        generationId: props.authResults.generationId,
      }),
    ).pipe(Effect.flatMap(decodeRpc), Effect.either);
    const rootSpan = batch.spans.at(-1);
    const link: ISpanLinkRecord | null =
      Either.isRight(persisted) &&
      props.request.traceContext !== null &&
      rootSpan !== undefined &&
      rootSpan.parentSpanId === null &&
      rootSpan.name === 'AggregateFrontendApi.getState'
        ? {
            linkId: makeSpanLinkId(),
            traceId: rootSpan.traceId,
            spanId: rootSpan.spanId,
            priorTraceId: props.request.traceContext.traceId,
            priorSpanId: props.request.traceContext.parentSpanId,
            kind: 'causedBy',
          }
        : null;
    return { result, link };
  },
);
