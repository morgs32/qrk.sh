import { it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Stream } from 'effect';
import { describe, expect } from 'vitest';

import { makeHandleStore } from '../makeHandleStore.js';

describe('makeHandleStore', () => {
  it.effect('shares one current Handle with active and late subscribers', () =>
    Effect.gen(function* () {
      const initial = { revision: 0 };
      const committed = { revision: 1 };
      const activeSubscriberReady = yield* Deferred.make<void>();
      const handleStore = makeHandleStore({ initialHandle: initial });
      const activeHandles = yield* handleStore.handleStream.pipe(
        Stream.tap(handle =>
          handle === initial
            ? Deferred.succeed(activeSubscriberReady, undefined)
            : Effect.void,
        ),
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild,
      );

      yield* Deferred.await(activeSubscriberReady);
      expect(yield* handleStore.getHandle()).toBe(initial);

      yield* handleStore.publish(committed);

      expect(Array.from(yield* Fiber.join(activeHandles))).toEqual([
        initial,
        committed,
      ]);
      expect(
        Array.from(
          yield* handleStore.handleStream.pipe(
            Stream.take(1),
            Stream.runCollect,
          ),
        ),
      ).toEqual([committed]);
      expect(yield* handleStore.getHandle()).toBe(committed);
    }),
  );
});
