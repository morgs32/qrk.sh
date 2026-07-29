import { describe, expect, it, vi } from 'vitest';

import { zerospinDevtoolsController } from './zerospinDevtoolsController.js';

describe('zerospinDevtoolsController', () => {
  it('opens an already-mounted shell without loading another shell', async () => {
    let resolveOpen: (() => void) | null = null;
    const open = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveOpen = resolve;
        }),
    );
    const load = vi.fn(() => Promise.resolve());
    const unregisterLoader = zerospinDevtoolsController.registerLoader(load);
    const unregisterShell = zerospinDevtoolsController.registerShell(open);

    const firstOpen = zerospinDevtoolsController.open();
    const concurrentOpen = zerospinDevtoolsController.open();

    expect(concurrentOpen).toBe(firstOpen);
    expect(open).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();

    resolveOpen?.();
    await firstOpen;

    unregisterShell();
    unregisterLoader();
  });

  it('loads one shell before opening it', async () => {
    const open = vi.fn(() => Promise.resolve());
    let unregisterShell: (() => void) | null = null;
    const load = vi.fn(async () => {
      unregisterShell = zerospinDevtoolsController.registerShell(open);
    });
    const unregisterLoader = zerospinDevtoolsController.registerLoader(load);

    await zerospinDevtoolsController.open();

    expect(load).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);

    unregisterShell?.();
    unregisterLoader();
  });

  it('clears a failed load so a later open can retry', async () => {
    const loadError = new Error('devtools chunk failed');
    const open = vi.fn(() => Promise.resolve());
    let unregisterShell: (() => void) | null = null;
    const load = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(loadError)
      .mockImplementationOnce(async () => {
        unregisterShell = zerospinDevtoolsController.registerShell(open);
      });
    const unregisterLoader = zerospinDevtoolsController.registerLoader(load);

    await expect(zerospinDevtoolsController.open()).rejects.toBe(loadError);
    await zerospinDevtoolsController.open();

    expect(load).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledTimes(1);

    unregisterShell?.();
    unregisterLoader();
  });

  it('rejects a removed loader and lets its replacement open immediately', async () => {
    const firstLoad = vi.fn(() => new Promise<void>(() => undefined));
    const unregisterFirstLoader =
      zerospinDevtoolsController.registerLoader(firstLoad);

    const staleOpen = zerospinDevtoolsController.open();
    const openReplacement = vi.fn(() => Promise.resolve());
    let unregisterReplacementShell: (() => void) | null = null;
    const replacementLoad = vi.fn(async () => {
      unregisterReplacementShell =
        zerospinDevtoolsController.registerShell(openReplacement);
    });
    const unregisterReplacementLoader =
      zerospinDevtoolsController.registerLoader(replacementLoad);

    unregisterFirstLoader();

    await expect(staleOpen).rejects.toThrow(
      'ZerospinConfig unmounted before Zerospin DevTools finished loading.',
    );
    await zerospinDevtoolsController.open();

    expect(replacementLoad).toHaveBeenCalledTimes(1);
    expect(openReplacement).toHaveBeenCalledTimes(1);

    unregisterReplacementShell?.();
    unregisterReplacementLoader();
  });

  it('requires a mounted ZerospinConfig loader', async () => {
    await expect(zerospinDevtoolsController.open()).rejects.toThrow(
      'ZerospinConfig must be mounted before opening Zerospin DevTools.',
    );
  });
});
