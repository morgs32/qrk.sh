import { expect, it } from 'vitest';

import { isSemVerOlder } from './isSemVerOlder.ts';

it.each([
  ['1.9.0', '1.10.0', true],
  ['1.10.0', '1.9.0', false],
  ['1.99.99', '2.0.0', true],
  ['1.0.9', '1.0.10', true],
  ['1.0.0', '1.0.0', false],
  ['1.0.0-alpha', '1.0.0', false],
  ['1.0.0', '1.0.0-alpha', false],
  ['1.0.0-alpha.1', '1.0.0-alpha.2', false],
  ['1.0.0+build.1', '1.0.0+build.2', false],
  ['1.9.0+build.9', '1.10.0-alpha.1', true],
  ['not-a-version', '2.0.0', false],
  ['1.0.0', 'not-a-version', false],
  ['01.0.0', '2.0.0', false],
  ['1.0.0', '2.0', false],
  ['1.0.0', '2.0.0-01', false],
])(
  'compares numeric version precedence %s < %s as %s',
  (left, right, older) => {
    expect(isSemVerOlder(left, right)).toBe(older);
  },
);
