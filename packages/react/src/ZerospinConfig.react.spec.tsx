import { act, StrictMode, useLayoutEffect } from 'react';

import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ZerospinConfig } from './ZerospinConfig';

const fakeDevtools = vi.hoisted(() => ({
  mountShouldFail: false,
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

      if (fakeDevtools.mountShouldFail) {
        throw new Error('devtools shell mount failed');
      }

      return <section aria-label="Zerospin DevTools" />;
    },
  };
});

describe('ZerospinConfig DevTools console API', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fakeDevtools.mountShouldFail = false;
    fakeDevtools.shellOpens = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('installs one lazy console open and removes it with the config', async () => {
    await act(async () => {
      root.render(
        <StrictMode>
          <ZerospinConfig
            frontendAuthenticators={{}}
            partitionKey="devtools-console"
          >
            <div>Application</div>
          </ZerospinConfig>
        </StrictMode>,
      );
    });

    expect(container.textContent).toBe('Application');
    expect(
      container.querySelector('[aria-label="Zerospin DevTools"]'),
    ).toBeNull();

    const devtools = window.zerospin?.devtools;
    expect(devtools).toBeDefined();
    if (devtools === undefined) {
      throw new Error(
        'ZerospinConfig did not install the DevTools console API.',
      );
    }

    const moduleLoadsBeforeOpen = fakeDevtools.moduleLoads;
    let firstOpen: Promise<void> | null = null;
    let concurrentOpen: Promise<void> | null = null;

    await act(async () => {
      firstOpen = devtools.open();
      concurrentOpen = devtools.open();
      await Promise.resolve();
    });

    expect(concurrentOpen).toBe(firstOpen);
    await firstOpen;

    expect(fakeDevtools.moduleLoads).toBe(moduleLoadsBeforeOpen + 1);
    expect(fakeDevtools.shellOpens).toBe(1);
    expect(
      container.querySelector('[aria-label="Zerospin DevTools"]'),
    ).not.toBeNull();

    await act(async () => {
      root.unmount();
    });

    expect(window.zerospin?.devtools).toBeUndefined();
    root = createRoot(container);
  });

  it('rejects a mount failure and retries the same dynamic module', async () => {
    await act(async () => {
      root.render(
        <ZerospinConfig
          frontendAuthenticators={{}}
          partitionKey="devtools-retry"
        >
          <div>Application</div>
        </ZerospinConfig>,
      );
    });

    const devtools = window.zerospin?.devtools;
    expect(devtools).toBeDefined();
    if (devtools === undefined) {
      throw new Error(
        'ZerospinConfig did not install the DevTools console API.',
      );
    }

    fakeDevtools.mountShouldFail = true;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    let failedOpen: Promise<void> | null = null;
    await act(async () => {
      failedOpen = devtools.open();
      await Promise.resolve();
    });
    await expect(failedOpen).rejects.toThrow('devtools shell mount failed');

    fakeDevtools.mountShouldFail = false;
    let retryOpen: Promise<void> | null = null;
    await act(async () => {
      retryOpen = devtools.open();
      await Promise.resolve();
    });
    await retryOpen;

    expect(fakeDevtools.shellOpens).toBe(1);
    expect(
      container.querySelector('[aria-label="Zerospin DevTools"]'),
    ).not.toBeNull();
    consoleError.mockRestore();
  });

  it('opens one directly mounted shell without lazily mounting another', async () => {
    await act(async () => {
      root.render(
        <ZerospinConfig
          frontendAuthenticators={{}}
          partitionKey="devtools-direct-mount"
        >
          <DirectZerospinDevtools />
        </ZerospinConfig>,
      );
    });

    const devtools = window.zerospin?.devtools;
    expect(devtools).toBeDefined();
    if (devtools === undefined) {
      throw new Error(
        'ZerospinConfig did not install the DevTools console API.',
      );
    }

    const moduleLoadsBeforeOpen = fakeDevtools.moduleLoads;
    await devtools.open();

    expect(fakeDevtools.moduleLoads).toBe(moduleLoadsBeforeOpen);
    expect(fakeDevtools.shellOpens).toBe(1);
    expect(
      container.querySelectorAll('[aria-label="Zerospin DevTools"]'),
    ).toHaveLength(1);
  });
});
