import { act, StrictMode, useLayoutEffect } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { authenticationSignature, main } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';
import { ZerospinError } from '@zerospin/error';
import { Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeZerospinApp } from './makeZerospinApp';

const acquireOpfsBackupWorkerMock = vi.hoisted(() => vi.fn());
const bootstrapAggregateFrontendSessionMock = vi.hoisted(() => vi.fn());
const bootstrapServiceFrontendSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/opfs-backup-worker', () => ({
  acquireOpfsBackupWorker: acquireOpfsBackupWorkerMock,
}));
vi.mock('@zerospin/frontend/bootstrapAggregateFrontendSession', () => ({
  bootstrapAggregateFrontendSession: bootstrapAggregateFrontendSessionMock,
}));
vi.mock('@zerospin/frontend/bootstrapServiceFrontendSession', () => ({
  bootstrapServiceFrontendSession: bootstrapServiceFrontendSessionMock,
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

const EmptyZerospinApp = makeZerospinApp({
  systemName: 'system-worker',
  authentication: { signature: authenticationSignature },
  frontends: {},
  runtime: sessionRuntime,
});

const serviceFrontend = makeFrontendController({
  systemName: 'system-worker',
  serviceName: 'catalog',
  frontendName: 'products',
  models: {},
});

const LifecycleZerospinApp = makeZerospinApp({
  systemName: 'system-worker',
  authentication: { signature: authenticationSignature },
  frontends: {
    main: { controller: main },
    products: { controller: serviceFrontend },
  },
  runtime: sessionRuntime,
});

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

describe('makeZerospinApp main-thread frontend bootstrap', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fakeDevtools.shellOpens = 0;
    acquireOpfsBackupWorkerMock.mockReset();
    acquireOpfsBackupWorkerMock.mockReturnValue(Effect.succeed({}));
    bootstrapAggregateFrontendSessionMock.mockReset();
    bootstrapAggregateFrontendSessionMock.mockReturnValue(
      Effect.succeed({
        systemId: 'sys_1',
        userId: 'usr_1',
        aggregateFrontendLockKey: 'aggregate-lock-1',
        executeAggregateFrontendCommand: ({ command }) =>
          Effect.succeed({ commandId: command.id }),
        getPushPaused: Effect.succeed(false),
        setPushPaused: () => Effect.void,
        pushNow: Effect.succeed({ status: 'empty' }),
      }),
    );
    bootstrapServiceFrontendSessionMock.mockReset();
    bootstrapServiceFrontendSessionMock.mockReturnValue(
      Effect.succeed({ systemId: 'sys_1', userId: 'usr_1' }),
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('mounts empty providers without acquiring storage and lazily opens DevTools once', async () => {
    const generateSignature = vi.fn(() =>
      Effect.succeed({ userId: 'usr_unused' }),
    );
    await act(async () => {
      root.render(
        <StrictMode>
          <EmptyZerospinApp.Provider
            aggregateIds={{}}
            generateSignature={generateSignature}
          >
            <div>Application</div>
          </EmptyZerospinApp.Provider>
        </StrictMode>,
      );
    });

    expect(container.textContent).toBe('Application');
    expect(acquireOpfsBackupWorkerMock).not.toHaveBeenCalled();
    expect(generateSignature).not.toHaveBeenCalled();
    const devtools = window.zerospin?.devtools;
    if (devtools === undefined) {
      throw new Error('DevTools API was not installed');
    }
    const moduleLoadsBeforeOpen = fakeDevtools.moduleLoads;
    let firstOpen: Promise<void> | undefined;
    let concurrentOpen: Promise<void> | undefined;
    await act(async () => {
      firstOpen = devtools.open();
      concurrentOpen = devtools.open();
      await Promise.resolve();
    });
    if (firstOpen === undefined || concurrentOpen === undefined) {
      throw new Error('DevTools open promises were not captured');
    }
    expect(concurrentOpen).toBe(firstOpen);
    await firstOpen;
    expect(fakeDevtools.moduleLoads).toBe(moduleLoadsBeforeOpen + 1);
    expect(fakeDevtools.shellOpens).toBe(1);
  });

  it('opens a directly mounted shell without lazily mounting another', async () => {
    await act(async () => {
      root.render(
        <EmptyZerospinApp.Provider
          aggregateIds={{}}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
        >
          <DirectZerospinDevtools />
        </EmptyZerospinApp.Provider>,
      );
    });
    const devtools = window.zerospin?.devtools;
    if (devtools === undefined) {
      throw new Error('DevTools API was not installed');
    }
    const moduleLoadsBeforeOpen = fakeDevtools.moduleLoads;
    await devtools.open();
    expect(fakeDevtools.moduleLoads).toBe(moduleLoadsBeforeOpen);
    expect(fakeDevtools.shellOpens).toBe(1);
  });

  it('shares one page backup port across parallel exact-target bootstraps and keeps signature callbacks current', async () => {
    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
        >
          <div>Ready application</div>
        </LifecycleZerospinApp.Provider>,
      );
    });

    expect(container.textContent).toBe('Ready application');
    expect(acquireOpfsBackupWorkerMock).toHaveBeenCalledOnce();
    expect(bootstrapAggregateFrontendSessionMock).toHaveBeenCalledOnce();
    expect(bootstrapServiceFrontendSessionMock).toHaveBeenCalledOnce();
    const aggregateRequest =
      bootstrapAggregateFrontendSessionMock.mock.calls[0]?.[0];
    const serviceRequest =
      bootstrapServiceFrontendSessionMock.mock.calls[0]?.[0];
    if (aggregateRequest === undefined || serviceRequest === undefined) {
      throw new Error('Frontend bootstrap requests were not captured');
    }
    expect(aggregateRequest.backupWorker).toBe(serviceRequest.backupWorker);
    expect(await aggregateRequest.generateSignature()).toEqual(
      encodeSuccess({ userId: 'usr_1' }),
    );

    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_2' })}
        >
          <div>Ready application</div>
        </LifecycleZerospinApp.Provider>,
      );
    });
    expect(await serviceRequest.generateSignature()).toEqual(
      encodeSuccess({ userId: 'usr_2' }),
    );
    expect(acquireOpfsBackupWorkerMock).toHaveBeenCalledOnce();
  });

  it('releases both scoped sessions before the page backup port', async () => {
    const releases: string[] = [];
    acquireOpfsBackupWorkerMock.mockReturnValueOnce(
      Effect.acquireRelease(Effect.succeed({}), () =>
        Effect.sync(() => releases.push('backup-port')),
      ),
    );
    bootstrapAggregateFrontendSessionMock.mockReturnValueOnce(
      Effect.acquireRelease(
        Effect.succeed({
          systemId: 'sys_1',
          userId: 'usr_1',
          aggregateFrontendLockKey: 'aggregate-lock-1',
          executeAggregateFrontendCommand: ({ command }) =>
            Effect.succeed({ commandId: command.id }),
          getPushPaused: Effect.succeed(false),
          setPushPaused: () => Effect.void,
          pushNow: Effect.succeed({ status: 'empty' }),
        }),
        () => Effect.sync(() => releases.push('aggregate')),
      ),
    );
    bootstrapServiceFrontendSessionMock.mockReturnValueOnce(
      Effect.acquireRelease(
        Effect.succeed({ systemId: 'sys_1', userId: 'usr_1' }),
        () => Effect.sync(() => releases.push('service')),
      ),
    );

    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
        >
          <div>Ready</div>
        </LifecycleZerospinApp.Provider>,
      );
    });
    await act(async () => root.unmount());
    expect(releases.at(-1)).toBe('backup-port');
    expect(new Set(releases.slice(0, -1))).toEqual(
      new Set(['aggregate', 'service']),
    );
    root = createRoot(container);
  });

  it('rejects inconsistent frontend identities and releases partial acquisition', async () => {
    const releases: string[] = [];
    bootstrapAggregateFrontendSessionMock.mockReturnValueOnce(
      Effect.acquireRelease(
        Effect.succeed({
          systemId: 'sys_1',
          userId: 'usr_1',
          aggregateFrontendLockKey: 'aggregate-lock-1',
          executeAggregateFrontendCommand: ({ command }) =>
            Effect.succeed({ commandId: command.id }),
          getPushPaused: Effect.succeed(false),
          setPushPaused: () => Effect.void,
          pushNow: Effect.succeed({ status: 'empty' }),
        }),
        () => Effect.sync(() => releases.push('aggregate')),
      ),
    );
    bootstrapServiceFrontendSessionMock.mockReturnValueOnce(
      Effect.acquireRelease(
        Effect.succeed({ systemId: 'sys_1', userId: 'usr_other' }),
        () => Effect.sync(() => releases.push('service')),
      ),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      await expect(
        act(async () => {
          root.render(
            <LifecycleZerospinApp.Provider
              aggregateIds={{ user: 'acct_1' }}
              generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
            >
              <div>Never published</div>
            </LifecycleZerospinApp.Provider>,
          );
        }),
      ).rejects.toThrow('Selected frontends resolved to different identities');
      expect(new Set(releases)).toEqual(new Set(['aggregate', 'service']));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rejects nested providers before acquiring the backup worker', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      await expect(
        act(async () => {
          root.render(
            <EmptyZerospinApp.Provider
              aggregateIds={{}}
              generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
            >
              <EmptyZerospinApp.Provider
                aggregateIds={{}}
                generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
              >
                <div>Nested</div>
              </EmptyZerospinApp.Provider>
            </EmptyZerospinApp.Provider>,
          );
        }),
      ).rejects.toThrow(
        'ZerospinApp.Provider cannot be mounted inside another ZerospinApp.Provider',
      );
      expect(acquireOpfsBackupWorkerMock).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('releases page ownership after backup acquisition fails', async () => {
    acquireOpfsBackupWorkerMock.mockReturnValueOnce(
      Effect.fail(
        new ZerospinError({
          code: 'opfs-backup-worker-test-failed',
          message: 'OPFS backup worker connection failed',
        }),
      ),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      await expect(
        act(async () => {
          root.render(
            <LifecycleZerospinApp.Provider
              aggregateIds={{ user: 'acct_1' }}
              generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
            >
              <div>Failed</div>
            </LifecycleZerospinApp.Provider>,
          );
        }),
      ).rejects.toThrow('OPFS backup worker connection failed');
      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => {
        root.render(
          <EmptyZerospinApp.Provider
            aggregateIds={{}}
            generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          >
            <div>Recovered</div>
          </EmptyZerospinApp.Provider>,
        );
      });
      expect(container.textContent).toBe('Recovered');
    } finally {
      consoleError.mockRestore();
    }
  });
});
