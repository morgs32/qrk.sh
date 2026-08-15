import type { IUserRef } from '@zerospin/core/aggregate/types';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
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

export const getAggregateFrontendState = Effect.fn(
  'SystemApi.getAggregateFrontendState',
)(function* (props: {
  request: IRpcRequest<
    [
      {
        actorRef: IUserRef;
        frontendName: string;
        aggregateFrontendLock: Schema.Schema.Type<
          typeof AggregateFrontendLockSchema
        >;
      },
    ]
  >;
  authResults: {
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemWorkerName: string;
  };
}) {
  const validatedArgs = yield* Schema.validate(
    Schema.mutable(
      Schema.Tuple(
        Schema.Struct({
          actorRef: Schema.Struct({
            aggregateId: makeAbbreviationIdSchema('acct'),
            aggregateName: Schema.String,
            userId: Schema.NonEmptyString,
          }),
          frontendName: Schema.String,
          aggregateFrontendLock: AggregateFrontendLockSchema,
        }),
      ),
    ),
  )(props.request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-api-arguments-invalid',
      prefix: 'SystemApi.getAggregateFrontendState received invalid arguments',
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
      actorRef: validatedArgs.right[0].actorRef,
      frontendName: validatedArgs.right[0].frontendName,
      aggregateFrontendLock: validatedArgs.right[0].aggregateFrontendLock,
      generationId: props.authResults.generationId,
    }),
  ).pipe(
    Effect.flatMap(decodeRpc),
    Effect.withSpan('SystemApi.getAggregateFrontendState', { root: true }),
    Effect.annotateSpans({
      generationId: props.authResults.generationId,
      systemId: props.authResults.systemId,
    }),
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
    rootSpan.name === 'SystemApi.getAggregateFrontendState'
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
});
