import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';

import { makeOutboxSubscriber } from './makeOutboxSubscriber.js';

it('waits for durable receive completion before acknowledging', async () => {
  const committed = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const receive = vi.fn(() =>
    Effect.gen(function* () {
      entered.resolve();
      yield* Effect.promise(() => committed.promise);
    }),
  );
  const subscriber = makeOutboxSubscriber({
    name: 'output',
    receive,
  });
  expect(Object.hasOwn(subscriber, 'receive')).toBe(false);
  let acknowledged = false;
  const result = subscriber.receive([]).then(value => {
    acknowledged = true;
    return value;
  });
  await entered.promise;
  expect(acknowledged).toBe(false);
  committed.resolve();
  expect((await result)._tag).toBe('Success');
});

it('encodes receiver failures', async () => {
  const receive = vi.fn(() =>
    Effect.fail(
      new ZerospinError({
        code: 'receive-failed',
        message: 'Commit did not succeed',
      }),
    ),
  );
  const subscriber = makeOutboxSubscriber({
    name: 'output',
    receive,
  });
  expect((await subscriber.receive([]))._tag).toBe('Failure');
  expect(receive).toHaveBeenCalledTimes(1);
});
