/**
 * Do not map @zerospin/core to src when project references expect dist output.
 *
 * @bad paths: { "@zerospin/core/*": ["./packages/core/src/*"] } plus references to core.
 */
export const tsconfigGood = {
  extends: '../../tsconfig.base.json',
  compilerOptions: {
    types: ['node'],
  },
  references: [{ path: '../../packages/core' }],
};

export const typecheckCommand = 'pnpm ts';
