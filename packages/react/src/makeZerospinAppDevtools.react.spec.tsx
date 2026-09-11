import { act, StrictMode, useLayoutEffect } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { main } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError } from '@zerospin/error';
import { CuidFactory } from '@zerospin/schema';
import { Effect, Layer, Redacted, Schema } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeZerospinApp } from './makeZerospinApp';
import { useSession } from './useSession';

const acquireBackupWorkerMock = vi.hoisted(() => vi.fn());
const bootstrapAggregateFrontendSessionMock = vi.hoisted(() => vi.fn());
const bootstrapServiceFrontendSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/backup-worker', () => ({
  acquireBackupWorker: acquireBackupWorkerMock,
}));
vi.mock('@zerospin/frontend/bootstrapAggregateFrontendSession', () => ({
  bootstrapAggregateFrontendSession: bootstrapAggregateFrontendSessionMock,
}));
vi.mock('@zerospin/frontend/bootstrapServiceFrontendSession', () => ({
  bootstrapServiceFrontendSession: bootstrapServiceFrontendSessionMock,
}));

const sessionRuntimeLayer = Layer.mergeAll(
  AsyncLive,
  NanoIdFactory,
  UlidMonotonicFactory,
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  Layer.succeed(ZerospinApiUrl, 'https://api.example.test'),
);

const EmptyZerospinApp = makeZerospinApp({
  systemName: 'system-worker',

  frontends: {},
  layer: sessionRuntimeLayer,
});

const serviceFrontend = makeFrontendController({
  authentication: main.authentication,
  systemName: 'system-worker',
  serviceVersion: '1.0.0',
  serviceName: 'catalog',
  name: 'products',
  models: {},
});

const LifecycleZerospinApp = makeZerospinApp({
  systemName: 'system-worker',

  frontends: {
    main,
    products: serviceFrontend,
  },
  layer: sessionRuntimeLayer,
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
    acquireBackupWorkerMock.mockReset();
    acquireBackupWorkerMock.mockReturnValue(Effect.succeed({}));
    bootstrapAggregateFrontendSessionMock.mockReset();
    bootstrapAggregateFrontendSessionMock.mockReturnValue(
      Effect.succeed({
        systemId: 'sys_1',
        authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
        aggregateFrontendLockKey: 'aggregate-lock-1',
        executeAggregateFrontendCommand: ({
          command,
        }: {
          command: { id: string };
        }) => Effect.succeed({ commandId: command.id }),
        getPushPaused: Effect.succeed(false),
        setPushPaused: () => Effect.void,
        pushNow: Effect.succeed({ status: 'empty' }),
      }),
    );
    bootstrapServiceFrontendSessionMock.mockReset();
    bootstrapServiceFrontendSessionMock.mockReturnValue(
      Effect.succeed({
        systemId: 'sys_1',
        authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
      }),
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('retains the authored definitions and rejects mismatched frontend names and systems', () => {
    expect(LifecycleZerospinApp.frontends.main.frontend).toBe(main);
    expect(LifecycleZerospinApp.frontends.main.models).toBe(main.models);
    expect(() =>
      makeZerospinApp({
        systemName: 'system-worker',

        frontends: {
          // @ts-expect-error Exercise runtime validation for untyped callers.
          wrong: main,
        },
        layer: sessionRuntimeLayer,
      }),
    ).toThrow('must equal controller name');
    expect(() =>
      makeZerospinApp({
        systemName: 'wrong-system',

        frontends: {
          // @ts-expect-error Exercise runtime validation for untyped callers.
          main,
        },
        layer: sessionRuntimeLayer,
      }),
    ).toThrow('belongs to system');
  });

  it('rejects a different Effect layer prototype before acquiring storage', async () => {
    const applicationLayer = Layer.mergeAll(sessionRuntimeLayer, Layer.empty);
    // Model a second Effect copy with the same layer protocol but its own prototype.
    Object.setPrototypeOf(applicationLayer, {
      ...Object.getPrototypeOf(applicationLayer),
    });
    const App = makeZerospinApp({
      systemName: 'system-worker',

      frontends: {},
      layer: applicationLayer,
    });

    await expect(
      act(async () => {
        root.render(
          <App.Provider generateSignature={{}}>
            <div>Ready</div>
          </App.Provider>,
        );
      }),
    ).rejects.toThrow('zerospin-app-effect-runtime-mismatch');
    expect(acquireBackupWorkerMock).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Ready');
  });

  it('mounts empty providers without acquiring storage and lazily opens DevTools once', async () => {
    const generateSignature = vi.fn(() =>
      Effect.succeed({
        authentication: { userId: 'usr_unused', aggregateId: 'acct_1' },
      }),
    );
    await act(async () => {
      root.render(
        <StrictMode>
          <EmptyZerospinApp.Provider generateSignature={{}}>
            <div>Application</div>
          </EmptyZerospinApp.Provider>
        </StrictMode>,
      );
    });

    expect(container.textContent).toBe('Application');
    expect(acquireBackupWorkerMock).not.toHaveBeenCalled();
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
        <EmptyZerospinApp.Provider generateSignature={{}}>
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

  it('uses a frontend-owned schema and encodes its signature for the worker', async () => {
    const App = makeZerospinApp({
      systemName: 'system-worker',

      frontends: {
        products: makeFrontendController({
          systemName: 'system-worker',
          serviceName: 'catalog',
          serviceVersion: '1.0.0',
          name: 'products',
          models: {},
          authentication: {
            ...serviceFrontend.authentication,
            signatureSchema: Schema.NumberFromString,
          },
        }),
      },
      layer: sessionRuntimeLayer,
    });
    await act(async () => {
      root.render(
        <App.Provider
          generateSignature={{ products: () => Effect.succeed(42) }}
        >
          Ready
        </App.Provider>,
      );
    });
    const request = bootstrapServiceFrontendSessionMock.mock.calls[0]?.[0];
    expect(request.session.frontend.authentication.signatureSchema).toBe(
      Schema.NumberFromString,
    );
    expect(await request.generateSignature()).toEqual(encodeSuccess('42'));

    await act(async () => {
      root.render(
        <App.Provider
          generateSignature={{
            products: () =>
              Effect.fail(
                new ZerospinError({
                  code: 'signature-unavailable',
                  message: 'Signed out',
                }),
              ),
          }}
        >
          Ready
        </App.Provider>,
      );
    });
    expect(await request.generateSignature()).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'signature-unavailable' },
    });
  });

  it('shares app services across sessions and signer updates, then releases local services before the app', async () => {
    const events: string[] = [];
    const clocks: Array<() => Effect.Effect<string>> = [];
    let acquisitions = 0;
    const appLayer = Layer.mergeAll(
      sessionRuntimeLayer,
      Layer.effect(
        MonotonicFactory,
        Effect.acquireRelease(
          Effect.sync(() => {
            const generation = ++acquisitions;
            events.push(`app-${generation}`);
            return () => Effect.succeed(`clock-${generation}`);
          }),
          () =>
            Effect.sync(() => {
              events.push('release-app');
            }),
        ),
      ),
    );
    const localLayer = Layer.effect(
      CuidFactory,
      Effect.gen(function* () {
        const clock = yield* MonotonicFactory;
        clocks.push(clock);
        return yield* Effect.acquireRelease(
          Effect.succeed(() => Effect.succeed('local-id')),
          () =>
            Effect.sync(() => {
              events.push('release-local');
            }),
        );
      }),
    );
    const left = makeFrontendController({
      authentication: main.authentication,
      systemName: 'system-worker',
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
      name: 'left',
      models: main.models,
      contracts: main.contracts,
      layer: localLayer,
    });
    const right = makeFrontendController({
      authentication: main.authentication,
      systemName: 'system-worker',
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
      name: 'right',
      models: main.models,
      contracts: main.contracts,
      layer: localLayer,
    });
    const App = makeZerospinApp({
      systemName: 'system-worker',

      frontends: { left, right },
      layer: appLayer,
    });
    await act(async () =>
      root.render(
        <App.Provider
          generateSignature={{
            left: () => Effect.succeed({ userId: 'usr_1' }),
            right: () => Effect.succeed({ userId: 'usr_1' }),
          }}
        >
          Ready
        </App.Provider>,
      ),
    );
    expect(container.textContent).toBe('Ready');
    expect(
      bootstrapAggregateFrontendSessionMock.mock.calls.map(
        ([props]) => props.session.frontend.name,
      ),
    ).toEqual(['left', 'right']);
    expect(acquisitions).toBe(1);
    expect(clocks).toHaveLength(2);
    expect(clocks[0]).toBe(clocks[1]);
    await act(async () =>
      root.render(
        <App.Provider
          generateSignature={{
            left: () => Effect.succeed({ userId: 'usr_1' }),
            right: () => Effect.succeed({ userId: 'usr_1' }),
          }}
        >
          Ready
        </App.Provider>,
      ),
    );
    expect(acquisitions).toBe(1);
    expect(clocks).toHaveLength(2);
    expect(events.filter(event => event === 'release-local')).toHaveLength(0);
    await act(async () => root.render(null));
    expect(events.slice(-3)).toEqual([
      'release-local',
      'release-local',
      'release-app',
    ]);
    await act(async () =>
      root.render(
        <App.Provider
          generateSignature={{
            left: () => Effect.succeed({ userId: 'usr_1' }),
            right: () => Effect.succeed({ userId: 'usr_1' }),
          }}
        >
          Ready
        </App.Provider>,
      ),
    );
    expect(acquisitions).toBe(2);
    expect(clocks[2]).not.toBe(clocks[0]);
  });

  it('surfaces application acquisition failure and releases partially acquired services', async () => {
    const events: string[] = [];
    const App = makeZerospinApp({
      systemName: 'system-worker',

      frontends: {},
      layer: Layer.mergeAll(
        sessionRuntimeLayer,
        Layer.effect(
          CuidFactory,
          Effect.gen(function* () {
            yield* Effect.acquireRelease(
              Effect.sync(() => {
                events.push('acquire');
              }),
              () =>
                Effect.sync(() => {
                  events.push('release');
                }),
            );
            return yield* new ZerospinError({
              code: 'app-failed',
              message: 'Application initialization failed',
            });
          }),
        ),
      ),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      await expect(
        act(async () =>
          root.render(
            <App.Provider generateSignature={{}}>Never published</App.Provider>,
          ),
        ),
      ).rejects.toThrow('Application initialization failed');
      expect(events).toEqual(['acquire', 'release']);
      expect(container.textContent).toBe('');
      expect(acquireBackupWorkerMock).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('waits for local initialization before publishing and cleans partial acquisition on failure', async () => {
    const events: string[] = [];
    const pending = Promise.withResolvers<void>();
    let fail = true;
    const local = Layer.effect(
      CuidFactory,
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            events.push('local');
          }),
          () =>
            Effect.sync(() => {
              events.push('release-local');
            }),
        );
        yield* Effect.promise(() => pending.promise);
        if (fail) {
          return yield* new ZerospinError({
            code: 'local-failed',
            message: 'Local initialization failed',
          });
        }
        return () => Effect.succeed('local-id');
      }),
    );
    const frontend = makeFrontendController({
      authentication: main.authentication,
      systemName: 'system-worker',
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
      name: 'delayed',
      models: main.models,
      contracts: main.contracts,
      layer: local,
    });
    const App = makeZerospinApp({
      systemName: 'system-worker',

      frontends: { delayed: frontend },
      layer: Layer.mergeAll(
        sessionRuntimeLayer,
        Layer.effect(
          MonotonicFactory,
          Effect.acquireRelease(
            Effect.sync(() => {
              events.push('app');
              return () => Effect.succeed('clock');
            }),
            () =>
              Effect.sync(() => {
                events.push('release-app');
              }),
          ),
        ),
      ),
    });
    await act(async () =>
      root.render(
        <App.Provider
          generateSignature={{
            delayed: () => Effect.succeed({ userId: 'usr_1' }),
          }}
        >
          Ready
        </App.Provider>,
      ),
    );
    expect(container.textContent).toBe('');
    expect(bootstrapAggregateFrontendSessionMock).not.toHaveBeenCalled();
    expect(events).toEqual(['app', 'local']);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      await expect(
        act(async () => {
          pending.resolve();
        }),
      ).rejects.toThrow('Local initialization failed');
      expect(events).toEqual(['app', 'local', 'release-local', 'release-app']);
      expect(container.textContent).toBe('');
      fail = false;
      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () =>
        root.render(
          <App.Provider
            generateSignature={{
              delayed: () => Effect.succeed({ userId: 'usr_1' }),
            }}
          >
            Ready
          </App.Provider>,
        ),
      );
      expect(container.textContent).toBe('Ready');
      expect(events.slice(-2)).toEqual(['app', 'local']);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('shares one page backup port across parallel exact-target bootstraps and keeps signature callbacks current', async () => {
    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          generateSignature={{
            main: () => Effect.succeed({ userId: 'usr_1' }),
            products: () => Effect.succeed({ userId: 'usr_1' }),
          }}
        >
          <div>Ready application</div>
        </LifecycleZerospinApp.Provider>,
      );
    });

    expect(container.textContent).toBe('Ready application');
    expect(acquireBackupWorkerMock).toHaveBeenCalledOnce();
    expect(bootstrapAggregateFrontendSessionMock).toHaveBeenCalledOnce();
    expect(bootstrapServiceFrontendSessionMock).toHaveBeenCalledOnce();
    const aggregateRequest =
      bootstrapAggregateFrontendSessionMock.mock.calls[0]?.[0];
    const serviceRequest =
      bootstrapServiceFrontendSessionMock.mock.calls[0]?.[0];
    if (aggregateRequest === undefined || serviceRequest === undefined) {
      throw new Error('Frontend bootstrap requests were not captured');
    }
    expect(aggregateRequest.aggregateVersion).toBe(main.aggregateVersion);
    expect(aggregateRequest.backupWorker).toBe(serviceRequest.backupWorker);
    expect(await aggregateRequest.generateSignature()).toEqual(
      encodeSuccess({ userId: 'usr_1' }),
    );

    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          generateSignature={{
            main: () => Effect.succeed({ userId: 'usr_2' }),
            products: () => Effect.succeed({ userId: 'usr_2' }),
          }}
        >
          <div>Ready application</div>
        </LifecycleZerospinApp.Provider>,
      );
    });
    expect(await serviceRequest.generateSignature()).toEqual(
      encodeSuccess({ userId: 'usr_2' }),
    );
    expect(acquireBackupWorkerMock).toHaveBeenCalledOnce();
  });

  it('releases both scoped sessions before the page backup port', async () => {
    const releases: string[] = [];
    acquireBackupWorkerMock.mockReturnValueOnce(
      Effect.acquireRelease(Effect.succeed({}), () =>
        Effect.sync(() => releases.push('backup-port')),
      ),
    );
    bootstrapAggregateFrontendSessionMock.mockReturnValueOnce(
      Effect.acquireRelease(
        Effect.succeed({
          systemId: 'sys_1',
          authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
          aggregateFrontendLockKey: 'aggregate-lock-1',
          executeAggregateFrontendCommand: ({
            command,
          }: {
            command: { id: string };
          }) => Effect.succeed({ commandId: command.id }),
          getPushPaused: Effect.succeed(false),
          setPushPaused: () => Effect.void,
          pushNow: Effect.succeed({ status: 'empty' }),
        }),
        () => Effect.sync(() => releases.push('aggregate')),
      ),
    );
    bootstrapServiceFrontendSessionMock.mockReturnValueOnce(
      Effect.acquireRelease(
        Effect.succeed({
          systemId: 'sys_1',
          authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
        }),
        () => Effect.sync(() => releases.push('service')),
      ),
    );

    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          generateSignature={{
            main: () => Effect.succeed({ userId: 'usr_1' }),
            products: () => Effect.succeed({ userId: 'usr_1' }),
          }}
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

  it('renews DevTools registrations and live browser IDs without remounting selected frontends', async () => {
    let mountCount = 0;
    let mountedAggregate: { readonly sessionId: string } | undefined;
    let mountedService: { readonly sessionId: string } | undefined;
    function Application() {
      const aggregate = useSession(LifecycleZerospinApp.frontends.main);
      const service = useSession(LifecycleZerospinApp.frontends.products);
      useLayoutEffect(() => {
        mountCount += 1;
        mountedAggregate = aggregate;
        mountedService = service;
      }, [aggregate, service]);
      return <div>Mounted application</div>;
    }
    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          generateSignature={{
            main: () => Effect.succeed({ userId: 'usr_1' }),
            products: () => Effect.succeed({ userId: 'usr_1' }),
          }}
        >
          <Application />
        </LifecycleZerospinApp.Provider>,
      );
    });
    const aggregateRequest =
      bootstrapAggregateFrontendSessionMock.mock.calls[0]?.[0];
    const serviceRequest =
      bootstrapServiceFrontendSessionMock.mock.calls[0]?.[0];
    if (aggregateRequest === undefined || serviceRequest === undefined) {
      throw new Error('Frontend bootstrap requests were not captured');
    }
    const aggregateId = aggregateRequest.session.sessionId;
    const serviceId = serviceRequest.session.sessionId;
    const entry = zerospinDevtoolsStore
      .getState()
      .aggregateSessionsById.get(aggregateId);
    await act(async () => {
      aggregateRequest.session.store.setState({ sessionStatus: 'superseded' });
      aggregateRequest.session.store.setState({
        sessionId: 'sesn_renewed_aggregate',
        sessionStatus: 'current',
      });
      serviceRequest.session.store.setState({
        sessionId: 'sesn_renewed_service',
        sessionStatus: 'current',
      });
    });
    expect(mountCount).toBe(1);
    expect(mountedAggregate?.sessionId).toBe('sesn_renewed_aggregate');
    expect(mountedService?.sessionId).toBe('sesn_renewed_service');
    expect(
      zerospinDevtoolsStore.getState().aggregateSessionsById.has(aggregateId),
    ).toBe(false);
    expect(
      zerospinDevtoolsStore.getState().serviceSessionsById.has(serviceId),
    ).toBe(false);
    expect(
      zerospinDevtoolsStore
        .getState()
        .aggregateSessionsById.get('sesn_renewed_aggregate'),
    ).toBe(entry);
    expect(
      zerospinDevtoolsStore
        .getState()
        .serviceSessionsById.get('sesn_renewed_service')?.sessionId,
    ).toBe('sesn_renewed_service');
    expect(await entry?.getPushPaused()).toEqual(encodeSuccess(false));
    expect(await entry?.pushNow()).toEqual(encodeSuccess({ status: 'empty' }));
    expect(acquireBackupWorkerMock).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    expect(zerospinDevtoolsStore.getState().aggregateSessionsById.size).toBe(0);
    expect(zerospinDevtoolsStore.getState().serviceSessionsById.size).toBe(0);
    aggregateRequest.session.store.setState({
      sessionId: 'sesn_after_cleanup',
    });
    serviceRequest.session.store.setState({ sessionId: 'sesn_after_cleanup' });
    expect(zerospinDevtoolsStore.getState().aggregateSessionsById.size).toBe(0);
    expect(zerospinDevtoolsStore.getState().serviceSessionsById.size).toBe(0);
    root = createRoot(container);
  });

  it('allows independent frontend authentication and releases both sessions', async () => {
    const releases: string[] = [];
    bootstrapAggregateFrontendSessionMock.mockReturnValueOnce(
      Effect.acquireRelease(
        Effect.succeed({
          systemId: 'sys_1',
          authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
          aggregateFrontendLockKey: 'aggregate-lock-1',
          executeAggregateFrontendCommand: ({
            command,
          }: {
            command: { id: string };
          }) => Effect.succeed({ commandId: command.id }),
          getPushPaused: Effect.succeed(false),
          setPushPaused: () => Effect.void,
          pushNow: Effect.succeed({ status: 'empty' }),
        }),
        () => Effect.sync(() => releases.push('aggregate')),
      ),
    );
    bootstrapServiceFrontendSessionMock.mockReturnValueOnce(
      Effect.acquireRelease(
        Effect.succeed({
          systemId: 'sys_1',
          authentication: { userId: 'usr_other', aggregateId: 'acct_1' },
        }),
        () => Effect.sync(() => releases.push('service')),
      ),
    );
    await act(async () => {
      root.render(
        <LifecycleZerospinApp.Provider
          generateSignature={{
            main: () => Effect.succeed({ userId: 'usr_1' }),
            products: () => Effect.succeed({ userId: 'usr_other' }),
          }}
        >
          <div>Published</div>
        </LifecycleZerospinApp.Provider>,
      );
    });
    expect(container.textContent).toBe('Published');
    await act(async () => root.render(null));
    expect(new Set(releases)).toEqual(new Set(['aggregate', 'service']));
  });

  it('rejects nested providers before acquiring the backup worker', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      await expect(
        act(async () => {
          root.render(
            <EmptyZerospinApp.Provider generateSignature={{}}>
              <EmptyZerospinApp.Provider generateSignature={{}}>
                <div>Nested</div>
              </EmptyZerospinApp.Provider>
            </EmptyZerospinApp.Provider>,
          );
        }),
      ).rejects.toThrow(
        'ZerospinApp.Provider cannot be mounted inside another ZerospinApp.Provider',
      );
      expect(acquireBackupWorkerMock).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('releases page ownership after backup acquisition fails', async () => {
    acquireBackupWorkerMock.mockReturnValueOnce(
      Effect.fail(
        new ZerospinError({
          code: 'backup-worker-test-failed',
          message: 'Backup worker connection failed',
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
              generateSignature={{
                main: () => Effect.succeed({ userId: 'usr_1' }),
                products: () => Effect.succeed({ userId: 'usr_1' }),
              }}
            >
              <div>Failed</div>
            </LifecycleZerospinApp.Provider>,
          );
        }),
      ).rejects.toThrow('Backup worker connection failed');
      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => {
        root.render(
          <EmptyZerospinApp.Provider generateSignature={{}}>
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
