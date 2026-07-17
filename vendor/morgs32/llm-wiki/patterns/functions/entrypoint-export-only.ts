import { Effect } from 'effect';

declare function makeIdFromAbbreviation(props: {
  abbreviation: string;
}): Effect.Effect<string, never, never>;

/**
 * String literals already preserve literal types for const generics.
 *
 * @bad `abbreviation: 'cmd' as const` when the literal is already const-narrowed.
 */
export const mintCommandId = Effect.fn('mintCommandId')(function* () {
  return yield* makeIdFromAbbreviation({ abbreviation: 'cmd' });
});

/**
 * Package entrypoints re-export; implementation lives in sibling files.
 *
 * @bad Component or function implementation inside `index.ts`.
 */
// index.tsx — export-only barrel:
// export { DevtoolsPanel } from './DevtoolsPanel.js';
// export type { IDevtoolsProps } from './types.js';
