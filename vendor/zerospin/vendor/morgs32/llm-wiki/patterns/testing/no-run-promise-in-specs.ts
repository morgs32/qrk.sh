import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

declare function loadRows(props: {
  db: unknown;
}): Effect.Effect<readonly { id: string; name: string }[], never, never>;

const db = {};

/**
 * Use `it.effect` for Effect-native specs — not `async` + `Effect.runPromise` around the whole test.
 *
 * @bad `it('runs query', async () => { await Effect.runPromise(Effect.gen(...)) })`.
 */
describe('loadRows', () => {
  it.effect('loads rows', () =>
    Effect.fn('loadRowsSpec')(function* () {
      const rows = yield* loadRows({ db });
      expect(rows).toEqual([{ id: 'usr_1', name: 'Alice' }]);
    }),
  );
});
