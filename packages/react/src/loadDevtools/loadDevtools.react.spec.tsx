import { act, useLayoutEffect } from 'react';

import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadDevtools } from './loadDevtools';

const fakeDevtools = vi.hoisted(() => ({
  moduleLoads: 0,
  shellOpens: 0,
}));

function DirectZerospinDevtools() {
  useLayoutEffect(
    () =>
      zerospinDevtoolsController.registerShell(async () => {
        fakeDevtools.shellOpens += 1;
      }),
    [],
  );

  return <section aria-label="Zerospin DevTools" />;
}

vi.mock('@zerospin/devtools/ZerospinDevtools', async () => {
  fakeDevtools.moduleLoads += 1;
  const { zerospinDevtoolsController } =
    await import('@zerospin/devtools/zerospinDevtoolsController');

  return {
    ZerospinDevtools() {
      useLayoutEffect(
        () =>
          zerospinDevtoolsController.registerShell(async () => {
            fakeDevtools.shellOpens += 1;
          }),
        [],
      );
      return <section aria-label="Zerospin DevTools" />;
    },
  };
});

describe('loadDevtools', () => {
  let container: HTMLDivElement;
  let root: Root;
  let loaded: Awaited<ReturnType<typeof loadDevtools>> | null;

  beforeEach(() => {
    fakeDevtools.shellOpens = 0;
    loaded = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    loaded?.dispose();
    loaded = null;
    await act(async () => root.unmount());
    container.remove();
    document
      .querySelectorAll('[data-zerospin-devtools-host]')
      .forEach(node => node.remove());
  });

  it('mounts the shell, installs the console API, and deduplicates concurrent opens', async () => {
    const moduleLoadsBefore = fakeDevtools.moduleLoads;
    loaded = await loadDevtools({ defaultOpen: false });
    expect(fakeDevtools.moduleLoads).toBe(moduleLoadsBefore + 1);
    expect(
      document.querySelector('section[aria-label="Zerospin DevTools"]'),
    ).not.toBeNull();
    expect(window.zerospin?.devtools?.open).toBeTypeOf('function');

    const firstOpen = loaded.open();
    const concurrentOpen = loaded.open();
    expect(concurrentOpen).toBe(firstOpen);
    await firstOpen;
    expect(fakeDevtools.shellOpens).toBe(1);
  });

  it('opens a directly mounted shell without lazily mounting another', async () => {
    await act(async () => {
      root.render(<DirectZerospinDevtools />);
    });
    const unregisterLoader = zerospinDevtoolsController.registerLoader(() => {
      throw new Error('lazy loader must not run when a shell is already mounted');
    });
    try {
      await act(async () => {
        await zerospinDevtoolsController.open();
      });
      expect(fakeDevtools.shellOpens).toBe(1);
    } finally {
      unregisterLoader();
    }
  });

  it('disposes the host and restores the previous console API', async () => {
    const previous = { open: vi.fn(async () => {}) };
    window.zerospin = { devtools: previous };
    loaded = await loadDevtools();
    expect(window.zerospin.devtools).not.toBe(previous);
    loaded.dispose();
    loaded = null;
    expect(window.zerospin.devtools).toBe(previous);
    expect(
      document.querySelector('[data-zerospin-devtools-host]'),
    ).toBeNull();
  });
});
