import { expect } from 'vitest';

import { toMatchProcedure, type IProcedureCall } from './toMatchProcedure/toMatchProcedure.ts';

expect.extend({
  toMatchProcedure,
});

declare module 'vitest' {
  // oxlint-disable-next-line typescript-eslint(consistent-type-definitions) -- module augmentation requires interface
  interface Assertion {
    toMatchProcedure(expected: IProcedureCall[]): void;
  }
  // oxlint-disable-next-line typescript-eslint(consistent-type-definitions) -- module augmentation requires interface
  interface AsymmetricMatchers {
    toMatchProcedure(expected: IProcedureCall[]): void;
  }
}
