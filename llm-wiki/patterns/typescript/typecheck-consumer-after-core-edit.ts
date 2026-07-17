/**
 * After editing core package source, run full-repo typecheck so upstream lib runs first.
 *
 * @bad `pnpm --filter shopping ts` immediately after editing core without rebuilding lib.
 */
export const typecheckAfterCoreEdit = {
  bad: 'pnpm --filter shopping ts',
  good: 'pnpm ts',
  goodSingleProject:
    'pnpm exec nx run @zerospin/core:lib && pnpm exec nx run shopping:ts',
};
