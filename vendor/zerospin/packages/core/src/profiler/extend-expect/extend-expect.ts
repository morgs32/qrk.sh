import { expect } from 'vitest';

import { toMatchProcedure, type ProcedureCall } from './toMatchProcedure.ts';

expect.extend({
  toMatchProcedure,
});

declare module 'vitest' {
  // oxlint-disable-next-line typescript-eslint(consistent-type-definitions) -- module augmentation requires interface
  interface Assertion {
    toMatchProcedure(expected: ProcedureCall[]): void;
  }
  // oxlint-disable-next-line typescript-eslint(consistent-type-definitions) -- module augmentation requires interface
  interface AsymmetricMatchers {
    toMatchProcedure(expected: ProcedureCall[]): void;
  }
}
