import { Effect } from 'effect';

import { coreAbbreviations } from '../_stubs/schema';

/**
 * Mint cursor ids via `coreAbbreviations` so TypeScript keeps the prefix literal.
 *
 * @bad Hardcode abbreviation string and cast to a local cursor alias.
 * @bad Call `makeCursor()` without an abbreviation entry.
 */
export const mintAccountCursor = Effect.fn('mintAccountCursor')(function* () {
  const cursor = yield* makeCursor({
    abbreviation: coreAbbreviations.accountCursor,
  });
  return cursor;
});

declare function makeCursor(props: {
  abbreviation: string;
}): Effect.Effect<unknown, never, never>;
