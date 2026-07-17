/**
 * Project-reference performance flags require Nx ^lib before consumer tsc.
 *
 * @bad Run tsc on a consumer app without building the upstream lib
 * (stale/missing dist declarations).
 */
export const tsconfigExtendsBase = {
  extends: '../../tsconfig.base.json',
  compilerOptions: {
    types: ['node'],
  },
  references: [{ path: '../../packages/core' }],
};

// tsconfig.base.json sets disableSourceOfProjectReferenceRedirect and disableReferencedProjectLoad
export const typecheckFromRoot = 'pnpm ts';
