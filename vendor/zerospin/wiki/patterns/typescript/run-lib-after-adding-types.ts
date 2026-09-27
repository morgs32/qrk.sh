/**
 * Run lib after adding types to an emit package — dist is the type product.
 *
 * @bad Typecheck shopping after editing core types without nx run @zerospin/core:lib.
 */
export const rebuildAfterNewCoreTypes = [
  'pnpm exec nx run @zerospin/core:lib',
  'pnpm exec nx run @zerospin/sdk:lib',
  'pnpm exec nx run shopping:ts',
];
