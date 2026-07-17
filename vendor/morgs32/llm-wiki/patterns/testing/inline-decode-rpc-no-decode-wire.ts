import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { describe } from 'vitest';

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, unknown>;

declare const fanout: {
  publish(props: { payload: unknown }): Promise<unknown>;
  getStatus(): Promise<unknown>;
};

declare function waitUntil(
  predicate: () => Effect.Effect<boolean, never, never>,
): Effect.Effect<void, never, never>;

const defaultPayload = { value: 'default' };

/**
 * Inline `Effect.promise` + `decodeRpc` at RPC boundaries — no shared `decodeWire` wrappers.
 *
 * @bad `decodeWire(wire)` helper that hides the only meaningful steps.
 * @bad `decodeRpc(Effect.promise(() => wire))` — `decodeRpc` takes the awaited encoding, not an Effect.
 * @bad Stacked helpers (`publishPayload`, `getFanoutStatus`) that only forward decode steps.
 */
describe('Fanout.publish (workerd)', () => {
  it.effect('publishes', () =>
    Effect.gen(function* () {
      const payload = { ...defaultPayload, value: 'payload-a' };
      const publishEncoded = yield* Effect.promise(() =>
        fanout.publish({ payload }),
      );
      const { cursor, prevCursor } = yield* decodeRpc<{
        cursor: string;
        prevCursor: string | null;
      }>(publishEncoded);
      const a = { cursor, prevCursor, payload };

      yield* waitUntil(() =>
        Effect.gen(function* () {
          const statusEncoded = yield* Effect.promise(() => fanout.getStatus());
          return (yield* decodeRpc<string>(statusEncoded)) === 'idle';
        }),
      );

      return a;
    }),
  );
});
