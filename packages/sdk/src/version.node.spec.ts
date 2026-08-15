import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ZEROSPIN_SDK_VERSION } from './version.js';

describe('ZEROSPIN_SDK_VERSION', () => {
  it('matches the published package version used by browser federation', async () => {
    const packageJson: unknown = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );

    expect(
      packageJson !== null && typeof packageJson === 'object'
        ? Reflect.get(packageJson, 'version')
        : undefined,
    ).toBe(ZEROSPIN_SDK_VERSION);
  });
});
