import { it } from '@effect/vitest';
import { main, User } from '@zerospin/core/fixtures/system';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { CuidFactory } from '@zerospin/schema';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { expect, vi } from 'vitest';

import { makeBrowserSession } from './makeBrowserSession';

it.effect(
  'forwards ID generation and failures without command notifications',
  () =>
    Effect.gen(function* () {
      let fail = false;
      const runtime = ManagedRuntime.make(
        Layer.mergeAll(
          UlidMonotonicFactory,
          Layer.succeed(CuidFactory, () =>
            Effect.sync(() => {
              if (fail) {
                throw new Error('ID generation failed');
              }
              return 'browser-id';
            }),
          ),
        ),
      );
      yield* Effect.addFinalizer(() => runtime.disposeEffect);
      const guards = yield* main.initializeGuards;
      const coreSession = makeAggregateSession({
        frontend: main,
        sessionId: 'sesn_browser_ids',
        guards,
        runtime,
      });
      const onCommandExecuted = vi.fn();
      const session = makeBrowserSession({
        session: coreSession,
        onCommandExecuted,
      });

      expect(session.makeId).toBe(coreSession.makeId);
      expect(session.makeId(User)).toBe('usr_browser-id');
      fail = true;
      expect(() => session.makeId(User)).toThrow('ID generation failed');
      expect(onCommandExecuted).not.toHaveBeenCalled();
    }),
);
