import { ZerospinError } from '@zerospin/error';
import {
  makeRpcHandler,
  makeTraceableRpcTarget,
  type ISpanId,
  type ITraceContext,
  type ITraceId,
} from '@zerospin/logger';
import { Effect, Either, Schema, Tracer } from 'effect';

import { actorRepo } from './ActorRepo.ts';
import { harness, queuedJobs } from './queuedJobs.ts';

const wrappedActorRepo = makeTraceableRpcTarget(actorRepo);

const processSubscriber = Effect.fn('AccountBlockRepo.processSubscriber')(
  function* () {
    const delivery = yield* wrappedActorRepo
      .handleAccountBlocks()
      .pipe(Effect.either);

    if (Either.isLeft(delivery)) {
      const span = yield* Effect.currentSpan.pipe(Effect.orDie);
      yield* Effect.logWarning(
        'actor delivery failed; retry scheduled for 500ms',
      );
      queuedJobs.push({
        name: 'alarm',
        delayMs: 500,
        run: () =>
          accountBlockRepo.alarm({
            traceContext: null,
            args: [
              {
                traceId: span.traceId as ITraceId,
                parentSpanId: span.spanId as ISpanId,
              },
            ],
          }),
      });
      return;
    }
  },
);

const publishHandler = makeRpcHandler('AccountBlockRepo.publish')(function* () {
  harness.accountBlockPublishAttempts += 1;
  const publishAttempt = harness.accountBlockPublishAttempts;
  yield* Effect.logInfo(`publish attempt ${publishAttempt}`);
  if (harness.failNextAccountBlockPublish) {
    harness.failNextAccountBlockPublish = false;
    return yield* new ZerospinError({
      code: 'mock-account-block-publish-failure',
      message: 'mock account block publish failure',
    }).pipe(Effect.mapError(Schema.encodeSync(ZerospinError.schema)));
  }

  const span = yield* Effect.currentSpan.pipe(Effect.orDie);
  queuedJobs.push({
    name: 'drain',
    delayMs: 0,
    run: () =>
      accountBlockRepo.drainActorOutbox({
        traceContext: null,
        args: [
          {
            traceId: span.traceId as ITraceId,
            parentSpanId: span.spanId as ISpanId,
          },
        ],
      }),
  });
});

const refreshQueueHandler = makeRpcHandler('AccountBlockRepo.refreshQueue')(
  function* () {
    yield* Effect.void;
  },
);

const drainActorOutboxHandler = makeRpcHandler(
  'AccountBlockRepo.drainActorOutbox',
)(function* (prior: ITraceContext) {
  const span = yield* Effect.currentSpan.pipe(Effect.orDie);
  span.addLinks([
    {
      _tag: 'SpanLink',
      span: Tracer.externalSpan({
        traceId: prior.traceId,
        spanId: prior.parentSpanId,
      }),
      attributes: { kind: 'causedBy' },
    },
  ]);
  yield* Effect.logInfo('drain started');
  yield* Effect.void.pipe(Effect.withSpan('AccountBlockRepo.refreshQueue'));
  yield* processSubscriber();
});

const alarmHandler = makeRpcHandler('AccountBlockRepo.alarm')(function* (
  prior: ITraceContext,
) {
  const span = yield* Effect.currentSpan.pipe(Effect.orDie);
  span.addLinks([
    {
      _tag: 'SpanLink',
      span: Tracer.externalSpan({
        traceId: prior.traceId,
        spanId: prior.parentSpanId,
      }),
      attributes: { kind: 'retryOf' },
    },
  ]);
  yield* Effect.logInfo('alarm fired');
  yield* Effect.gen(function* () {
    yield* Effect.void.pipe(Effect.withSpan('AccountBlockRepo.refreshQueue'));
    yield* processSubscriber();
  }).pipe(Effect.withSpan('AccountBlockRepo.drainActorOutbox'));
});

export const accountBlockRepo = {
  publish: (request: Parameters<typeof publishHandler>[0]) =>
    Effect.runPromise(publishHandler(request)),
  refreshQueue: (request: Parameters<typeof refreshQueueHandler>[0]) =>
    Effect.runPromise(refreshQueueHandler(request)),
  drainActorOutbox: (request: Parameters<typeof drainActorOutboxHandler>[0]) =>
    Effect.runPromise(drainActorOutboxHandler(request)),
  alarm: (request: Parameters<typeof alarmHandler>[0]) =>
    Effect.runPromise(alarmHandler(request)),
};
