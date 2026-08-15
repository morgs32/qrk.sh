/*
 * System-worker annotation:
 * Runs the AggregateBlockRepo subscriber queue from durable refresh state.
 */

import type { Async } from '@zerospin/core/async/Async';
import type { IAnyError } from '@zerospin/error';
import { Effect, Tracer } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeFanoutQueue } from '../../makeFanoutQueue/makeFanoutQueue.js';
import type { refreshQueue } from '../refreshQueue/refreshQueue.js';

export const drainAggregateFrontendOutbox = Effect.fn(
  'AggregateBlockRepo.drainAggregateFrontendOutbox',
)(function* (props: {
  alarm?: true;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  storage: DurableObjectStorage;
  refresh(): Effect.Effect<
    Effect.Effect.Success<ReturnType<typeof refreshQueue>>,
    IAnyError,
    Async
  >;
  processSubscriber(
    subscriberDelivery: Effect.Effect.Success<
      ReturnType<typeof refreshQueue>
    >[number],
    retry: ReturnType<typeof makeDeliveryQueue>['retry'],
  ): Effect.Effect<boolean, IAnyError, Async>;
}): Effect.fn.Return<void, IAnyError, Async> {
  const causedBy = yield* Effect.promise(() =>
    props.storage.get<{ traceId: string; spanId: string }>(
      'telemetryDrainCausedBy',
    ),
  ).pipe(Effect.catchAllCause(() => Effect.succeed(undefined)));
  if (causedBy !== undefined) {
    yield* Effect.promise(() =>
      props.storage.delete('telemetryDrainCausedBy'),
    ).pipe(Effect.catchAllCause(() => Effect.void));
    const span = yield* Effect.currentSpan.pipe(Effect.orDie);
    span.addLinks([
      {
        _tag: 'SpanLink',
        span: Tracer.externalSpan(causedBy),
        attributes: { kind: 'causedBy' },
      },
    ]);
  }

  const lane = makeFanoutQueue({
    deliveryQueue: props.deliveryQueue,
    name: 'AggregateBlockRepo.aggregateFrontendSubscribers',
    readSubscribers: props.refresh,
    subscriberKey: delivery => delivery.subscriber.aggregateFrontendRepoName,
    processSubscriber: props.processSubscriber,
    hasPending: () =>
      props.refresh().pipe(Effect.map(deliveries => deliveries.length > 0)),
  });
  yield* props.deliveryQueue.drain({
    ...(props.alarm === true ? { alarm: true } : {}),
    lanes: [{ ...lane, requested: true }],
  });
});
