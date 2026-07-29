import { act, useLayoutEffect } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ZerospinConfig } from './ZerospinConfig';

const fakeImport = vi.hoisted(() => ({ attempts: 0 }));

vi.mock('@zerospin/devtools/ZerospinDevtools', async () => {
  fakeImport.attempts += 1;
  if (fakeImport.attempts === 1) {
    throw new Error('devtools chunk failed');
  }

  const { zerospinDevtoolsController } =
    await import('@zerospin/devtools/zerospinDevtoolsController');

  return {
    ZerospinDevtools() {
      useLayoutEffect(
        () => zerospinDevtoolsController.registerShell(() => Promise.resolve()),
        [],
      );

      return <section aria-label="Zerospin DevTools" />;
    },
  };
});

describe('ZerospinConfig DevTools dynamic import failure', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fakeImport.attempts = 0;
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

  it('rejects a failed component import and retries it on the next open', async () => {
    await act(async () => {
      root.render(
        <ZerospinConfig
          frontendAuthenticators={{}}
          partitionKey="devtools-import-retry"
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

    await expect(devtools.open()).rejects.toThrow();
    expect(fakeImport.attempts).toBe(1);

    let retryOpen: Promise<void> | null = null;
    await act(async () => {
      retryOpen = devtools.open();
      await Promise.resolve();
    });
    await retryOpen;

    expect(fakeImport.attempts).toBe(2);
    expect(
      container.querySelector('[aria-label="Zerospin DevTools"]'),
    ).not.toBeNull();
  });
});
