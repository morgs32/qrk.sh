import { act, StrictMode, useLayoutEffect } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { authenticationSignature, main } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError } from '@zerospin/error';
import { Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeZerospinApp } from './makeZerospinApp';

const acquireUserPartitionRepoMock = vi.hoisted(() => vi.fn());
const bootstrapBrowserSessionMock = vi.hoisted(() => vi.fn());
const bootstrapBrowserServiceSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/shared-worker/acquireUserPartitionRepo', () => ({
  acquireUserPartitionRepo: acquireUserPartitionRepoMock,
}));
vi.mock('./bootstrapBrowserSession', () => ({
  bootstrapBrowserSession: bootstrapBrowserSessionMock,
}));
vi.mock('./bootstrapBrowserServiceSession', () => ({
  bootstrapBrowserServiceSession: bootstrapBrowserServiceSessionMock,
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

const lifecycleServiceFrontend = makeFrontendController({
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
    products: { controller: lifecycleServiceFrontend },
  },
  runtime: sessionRuntime,
});

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

describe('makeZerospinApp Provider DevTools console API', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fakeDevtools.mountShouldFail = false;
    fakeDevtools.shellOpens = 0;
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
    bootstrapBrowserSessionMock.mockReset();
    bootstrapBrowserSessionMock.mockReturnValue(
      Effect.succeed({
        stageAggregateFrontendCommand: () =>
          Effect.succeed({ commandId: 'cmd_test' }),
        releaseBrowserSession: Effect.void,
      }),
    );
    bootstrapBrowserServiceSessionMock.mockReset();
    bootstrapBrowserServiceSessionMock.mockReturnValue(
      Effect.succeed({ releaseBrowserSession: Effect.void }),
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

  it('installs one lazy console open and removes it with the generated Provider root', async () => {
    await act(async () => {
      root.render(
        <StrictMode>
          <ZerospinApp.Provider
            aggregateIds={{}}
            generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          >
            <div>Application</div>
          </ZerospinApp.Provider>
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
        'ZerospinApp.Provider did not install the DevTools console API.',
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

    await act(async () => {
      root.render(
        <StrictMode>
          <ZerospinApp.Provider
            aggregateIds={{}}
            generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          >
            <div>Remounted application</div>
          </ZerospinApp.Provider>
        </StrictMode>,
      );
    });
    expect(container.textContent).toBe('Remounted application');
  });

  it('rejects a mount failure and retries the same dynamic module', async () => {
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
        <ZerospinApp.Provider
          aggregateIds={{}}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
        >
          <DirectZerospinDevtools />
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

    const moduleLoadsBeforeOpen = fakeDevtools.moduleLoads;
    await devtools.open();

    expect(fakeDevtools.moduleLoads).toBe(moduleLoadsBeforeOpen);
    expect(fakeDevtools.shellOpens).toBe(1);
    expect(
      container.querySelectorAll('[aria-label="Zerospin DevTools"]'),
    ).toHaveLength(1);
  });

  it('uses worker-returned identity and mode while updating the signature callback without restarting', async () => {
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

    expect(acquireUserPartitionRepoMock).toHaveBeenCalledTimes(1);
    const request = acquireUserPartitionRepoMock.mock.calls[0]?.[0];
    if (request === undefined) {
      throw new Error('SharedWorker acquisition request was not captured');
    }
    expect(await request.generateSignature()).toEqual({
      _tag: 'Right',
      right: { userId: 'usr_1' },
    });
    expect([
      ...zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ]).toEqual([
      expect.objectContaining({
        systemId: 'sys_1',
        userId: 'usr_1',
        mode: 'online',
      }),
    ]);

    await act(async () => {
      root.render(
        <ZerospinApp.Provider
          aggregateIds={{}}
          generateSignature={() => Effect.succeed({ userId: 'usr_2' })}
        >
          <div>Application</div>
        </ZerospinApp.Provider>,
      );
    });

    expect(acquireUserPartitionRepoMock).toHaveBeenCalledTimes(1);
    expect(await request.generateSignature()).toEqual({
      _tag: 'Right',
      right: { userId: 'usr_2' },
    });
  });

  it('returns authentication-signature-invalid to the worker without page fallback', async () => {
    await act(async () => {
      root.render(
        <ZerospinApp.Provider
          aggregateIds={{}}
          generateSignature={() => Effect.succeed(JSON.parse('{"userId":1}'))}
        >
          <div>Application</div>
        </ZerospinApp.Provider>,
      );
    });

    const request = acquireUserPartitionRepoMock.mock.calls[0]?.[0];
    if (request === undefined) {
      throw new Error('SharedWorker acquisition request was not captured');
    }
    await expect(request.generateSignature()).resolves.toEqual({
      _tag: 'Left',
      left: expect.objectContaining({
        code: 'authentication-signature-invalid',
      }),
    });
    expect(acquireUserPartitionRepoMock).toHaveBeenCalledTimes(1);
  });

  it('feeds worker identity and mode to every session and releases sessions before the port', async () => {
    const releases: string[] = [];
    acquireUserPartitionRepoMock.mockReturnValueOnce(
      Effect.succeed({
        api: {
          listAggregateFrontendReplicas: vi.fn(),
          listServiceFrontendReplicas: vi.fn(),
        },
        release: Effect.sync(() => {
          releases.push('port');
        }),
        systemId: 'sys_worker',
        userId: 'usr_worker',
        mode: 'existing-only',
      }),
    );
    bootstrapBrowserSessionMock.mockReturnValueOnce(
      Effect.succeed({
        stageAggregateFrontendCommand: () =>
          Effect.succeed({ commandId: 'cmd_test' }),
        releaseBrowserSession: Effect.sync(() => {
          releases.push('aggregate');
        }),
      }),
    );
    bootstrapBrowserServiceSessionMock.mockReturnValueOnce(
      Effect.succeed({
        releaseBrowserSession: Effect.sync(() => {
          releases.push('service');
        }),
      }),
    );

    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_worker' })}
        >
          <div>Ready application</div>
        </LifecycleZerospinApp.Provider>,
      );
    });

    expect(container.textContent).toBe('Ready application');
    expect(bootstrapBrowserSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemId: 'sys_worker',
        userId: 'usr_worker',
        mode: 'existing-only',
      }),
    );
    expect(bootstrapBrowserServiceSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemId: 'sys_worker',
        userId: 'usr_worker',
        mode: 'existing-only',
      }),
    );

    await act(async () => {
      root.unmount();
    });
    expect(releases.at(-1)).toBe('port');
    expect(new Set(releases.slice(0, -1))).toEqual(
      new Set(['aggregate', 'service']),
    );
    root = createRoot(container);
  });

  it('releases each replaced Provider session before its SharedWorker port', async () => {
    const releases: string[] = [];
    acquireUserPartitionRepoMock
      .mockReturnValueOnce(
        Effect.succeed({
          api: {
            listAggregateFrontendReplicas: vi.fn(),
            listServiceFrontendReplicas: vi.fn(),
          },
          release: Effect.sync(() => {
            releases.push('port-1');
          }),
          systemId: 'sys_worker',
          userId: 'usr_worker',
          mode: 'online',
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          api: {
            listAggregateFrontendReplicas: vi.fn(),
            listServiceFrontendReplicas: vi.fn(),
          },
          release: Effect.sync(() => {
            releases.push('port-2');
          }),
          systemId: 'sys_worker',
          userId: 'usr_worker',
          mode: 'online',
        }),
      );
    bootstrapBrowserSessionMock
      .mockReturnValueOnce(
        Effect.succeed({
          stageAggregateFrontendCommand: () =>
            Effect.succeed({ commandId: 'cmd_test_1' }),
          releaseBrowserSession: Effect.sync(() => {
            releases.push('aggregate-1');
          }),
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          stageAggregateFrontendCommand: () =>
            Effect.succeed({ commandId: 'cmd_test_2' }),
          releaseBrowserSession: Effect.sync(() => {
            releases.push('aggregate-2');
          }),
        }),
      );
    bootstrapBrowserServiceSessionMock
      .mockReturnValueOnce(
        Effect.succeed({
          releaseBrowserSession: Effect.sync(() => {
            releases.push('service-1');
          }),
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          releaseBrowserSession: Effect.sync(() => {
            releases.push('service-2');
          }),
        }),
      );

    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_worker' })}
        >
          <div>First lifecycle</div>
        </LifecycleZerospinApp.Provider>,
      );
    });
    expect(container.textContent).toBe('First lifecycle');

    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          aggregateIds={{ user: 'acct_2' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_worker' })}
        >
          <div>Second lifecycle</div>
        </LifecycleZerospinApp.Provider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.textContent).toBe('Second lifecycle');
      expect(releases).toEqual(
        expect.arrayContaining(['aggregate-1', 'service-1', 'port-1']),
      );
    });
    expect(releases.indexOf('aggregate-1')).toBeLessThan(
      releases.indexOf('port-1'),
    );
    expect(releases.indexOf('service-1')).toBeLessThan(
      releases.indexOf('port-1'),
    );

    await act(async () => {
      root.unmount();
    });
    expect(releases).toEqual(
      expect.arrayContaining(['aggregate-2', 'service-2', 'port-2']),
    );
    expect(releases.indexOf('aggregate-2')).toBeLessThan(
      releases.indexOf('port-2'),
    );
    expect(releases.indexOf('service-2')).toBeLessThan(
      releases.indexOf('port-2'),
    );
    root = createRoot(container);
  });

  it('releases a successful partial bootstrap before the port when its sibling fails', async () => {
    const releases: string[] = [];
    acquireUserPartitionRepoMock.mockReturnValueOnce(
      Effect.succeed({
        api: {
          listAggregateFrontendReplicas: vi.fn(),
          listServiceFrontendReplicas: vi.fn(),
        },
        release: Effect.sync(() => {
          releases.push('port');
        }),
        systemId: 'sys_worker',
        userId: 'usr_worker',
        mode: 'online',
      }),
    );
    bootstrapBrowserSessionMock.mockReturnValueOnce(
      Effect.succeed({
        stageAggregateFrontendCommand: () =>
          Effect.succeed({ commandId: 'cmd_test' }),
        releaseBrowserSession: Effect.sync(() => {
          releases.push('aggregate');
        }),
      }),
    );
    bootstrapBrowserServiceSessionMock.mockReturnValueOnce(
      Effect.sleep('10 millis').pipe(
        Effect.zipRight(
          Effect.fail(
            new ZerospinError({
              code: 'service-bootstrap-test-failed',
              message: 'Service bootstrap failed after aggregate acquisition',
            }),
          ),
        ),
      ),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_worker' })}
        >
          <div>Never published</div>
        </LifecycleZerospinApp.Provider>,
      );
    });
    await expect(
      act(async () => {
        await vi.waitFor(() => {
          expect(releases).toEqual(['aggregate', 'port']);
        });
      }),
    ).rejects.toThrow('service-bootstrap-test-failed');
    consoleError.mockRestore();
  });

  it('rejects a nested Provider before SharedWorker construction', async () => {
    acquireUserPartitionRepoMock.mockClear();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      act(async () => {
        root.render(
          <ZerospinApp.Provider
            aggregateIds={{}}
            generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          >
            <ZerospinApp.Provider
              aggregateIds={{}}
              generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
            >
              <div>Nested application</div>
            </ZerospinApp.Provider>
          </ZerospinApp.Provider>,
        );
      }),
    ).rejects.toThrow(
      'ZerospinApp.Provider cannot be mounted inside another ZerospinApp.Provider',
    );
    expect(acquireUserPartitionRepoMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rejects sibling roots and separately constructed app namespaces before a second bootstrap', async () => {
    const secondContainer = document.createElement('div');
    document.body.appendChild(secondContainer);
    const secondRoot = createRoot(secondContainer);
    const SecondZerospinApp = makeZerospinApp({
      systemName: 'system-worker',
      authentication: { signature: authenticationSignature },
      frontends: {},
      runtime: sessionRuntime,
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await act(async () => {
        root.render(
          <ZerospinApp.Provider
            aggregateIds={{}}
            generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          >
            <div>First root</div>
          </ZerospinApp.Provider>,
        );
      });
      expect(acquireUserPartitionRepoMock).toHaveBeenCalledTimes(1);

      await expect(
        act(async () => {
          secondRoot.render(
            <SecondZerospinApp.Provider
              aggregateIds={{}}
              generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
            >
              <div>Second root</div>
            </SecondZerospinApp.Provider>,
          );
        }),
      ).rejects.toThrow('zerospin-app-provider-already-mounted');
      expect(acquireUserPartitionRepoMock).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        secondRoot.unmount();
      });
      secondContainer.remove();
      consoleError.mockRestore();
    }
  });

  it('releases page ownership after SharedWorker acquisition fails', async () => {
    acquireUserPartitionRepoMock.mockReturnValueOnce(
      Effect.fail(
        new ZerospinError({
          code: 'authentication-signature-test-failed',
          message: 'Worker-requested authentication signature failed',
        }),
      ),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      act(async () => {
        root.render(
          <ZerospinApp.Provider
            aggregateIds={{}}
            generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          >
            <div>Failed application</div>
          </ZerospinApp.Provider>,
        );
      }),
    ).rejects.toThrow('authentication-signature-test-failed');
    expect(acquireUserPartitionRepoMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
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
    await act(async () => {
      root.render(
        <ZerospinApp.Provider
          aggregateIds={{}}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
        >
          <div>Recovered application</div>
        </ZerospinApp.Provider>,
      );
    });
    expect(container.textContent).toBe('Recovered application');
    consoleError.mockRestore();
  });
});
