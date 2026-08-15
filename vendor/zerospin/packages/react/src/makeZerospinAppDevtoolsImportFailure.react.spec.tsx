import { act, useLayoutEffect } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { authenticationSignature } from '@zerospin/core/fixtures/system';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeZerospinApp } from './makeZerospinApp';

const acquireUserPartitionRepoMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/shared-worker/acquireUserPartitionRepo', () => ({
  acquireUserPartitionRepo: acquireUserPartitionRepoMock,
}));

const sessionRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    NanoIdFactory,
    UlidMonotonicFactory,
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
    Layer.succeed(ZerospinApiUrl, 'https://api.example.test'),
  ),
);

const ZerospinApp = makeZerospinApp({
  systemName: 'system-worker',
  authentication: { signature: authenticationSignature },
  frontends: {},
  runtime: sessionRuntime,
});

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

describe('makeZerospinApp Provider DevTools dynamic import failure', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fakeImport.attempts = 0;
    acquireUserPartitionRepoMock.mockReset();
    acquireUserPartitionRepoMock.mockReturnValue(
      Effect.succeed({
        api: {
          listAggregateFrontendReplicas: vi.fn(),
          listServiceFrontendReplicas: vi.fn(),
        },
        release: Effect.void,
        systemId: 'sys_1',
        userId: 'usr_1',
        mode: 'online',
      }),
    );
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
        <ZerospinApp.Provider
          aggregateIds={{}}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
        >
          <div>Application</div>
        </ZerospinApp.Provider>,
      );
    });

    const devtools = window.zerospin?.devtools;
    expect(devtools).toBeDefined();
    if (devtools === undefined) {
      throw new Error(
        'ZerospinApp.Provider did not install the DevTools console API.',
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
