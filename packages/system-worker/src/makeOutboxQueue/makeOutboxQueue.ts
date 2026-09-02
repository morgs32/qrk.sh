import type { Async } from '@zerospin/core/async/Async';
import type { IAnyError } from '@zerospin/error';
import { Effect, Result } from 'effect';

import type { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';

export const makeOutboxQueue = <ROW, PAYLOAD, RESULT>(props: {
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  name: string;
  readPending(): Effect.Effect<readonly ROW[], IAnyError, Async>;
  targetKey(row: ROW): string;
  decode(row: ROW): Effect.Effect<PAYLOAD, IAnyError, Async>;
  deliver(row: ROW, payload: PAYLOAD): Effect.Effect<RESULT, IAnyError, Async>;
  acknowledge(
    row: ROW,
    result: RESULT,
    payload: PAYLOAD,
  ): Effect.Effect<void, IAnyError, Async>;
  recordFailure(
    row: ROW,
    error: IAnyError,
    payload: PAYLOAD,
  ): Effect.Effect<void, IAnyError, Async>;
  hasPending(): Effect.Effect<boolean, IAnyError, Async>;
}) => ({
  name: props.name,
  drain: Effect.fn(`${props.name}.drain`)(function* () {
    const pending = (yield* props.readPending()).slice(0, 64);
    const targetRows = new Map<string, ROW[]>();
    for (const row of pending) {
      const target = props.targetKey(row);
      const rows = targetRows.get(target);
      if (rows === undefined) {
        targetRows.set(target, [row]);
      } else {
        rows.push(row);
      }
    }

    const targetResults = yield* Effect.forEach(
      targetRows.values(),
      rows =>
        Effect.gen(function* () {
          for (const row of rows) {
            const payload = yield* props.decode(row);
            const delivered = yield* props.deliveryQueue
              .retry(props.deliver(row, payload))
              .pipe(Effect.result);
            if (Result.isFailure(delivered)) {
              yield* props.recordFailure(row, delivered.failure, payload);
              break;
            }
            yield* props.acknowledge(row, delivered.success, payload);
          }
        }).pipe(Effect.result),
      { concurrency: 'unbounded' },
    );
    const targetFailure = targetResults.find(Result.isFailure);
    if (targetFailure !== undefined) {
      return yield* targetFailure.failure;
    }
  }),
  hasPending: props.hasPending,
});
