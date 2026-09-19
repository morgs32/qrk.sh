import { useLayoutEffect } from 'react';

import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadDevtools } from './loadDevtools';

const fakeImport = vi.hoisted(() => ({
  // Start false so Vitest can install/introspect the mock without throwing.
  shouldFail: false,
  exportReads: 0,
}));

vi.mock('@zerospin/devtools/ZerospinDevtools', () => ({
  get ZerospinDevtools() {
    fakeImport.exportReads += 1;
    if (fakeImport.shouldFail) {
      throw new Error('devtools chunk failed');
    }
    return function ZerospinDevtools() {
      useLayoutEffect(
        () =>
          zerospinDevtoolsController.registerShell(() => Promise.resolve()),
        [],
      );
      return <section aria-label="Zerospin DevTools" />;
    };
  },
}));

describe('loadDevtools dynamic import failure', () => {
  beforeEach(() => {
    fakeImport.shouldFail = true;
    fakeImport.exportReads = 0;
    document
      .querySelectorAll('[data-zerospin-devtools-host]')
      .forEach(node => node.remove());
    if (window.zerospin?.devtools !== undefined) {
      delete window.zerospin.devtools;
    }
  });

  afterEach(() => {
    fakeImport.shouldFail = false;
    document
      .querySelectorAll('[data-zerospin-devtools-host]')
      .forEach(node => node.remove());
    if (window.zerospin?.devtools !== undefined) {
      delete window.zerospin.devtools;
    }
  });

  it('rejects a failed component import and retries on the next load', async () => {
    await expect(loadDevtools()).rejects.toThrow('devtools chunk failed');
    expect(fakeImport.exportReads).toBeGreaterThanOrEqual(1);
    expect(window.zerospin?.devtools).toBeUndefined();
    expect(
      document.querySelector('[data-zerospin-devtools-host]'),
    ).toBeNull();

    fakeImport.shouldFail = false;
    const loaded = await loadDevtools();
    expect(
      document.querySelector('[aria-label="Zerospin DevTools"]'),
    ).not.toBeNull();
    loaded.dispose();
  });
});
