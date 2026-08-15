import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { Effect, Layer, Redacted } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newMessagePortRpcSession = vi.hoisted(() => vi.fn());

vi.mock('capnweb', () => ({
  newMessagePortRpcSession,
}));

describe('acquireUserPartitionRepo', () => {
  const systemId = 'sys_1';
  const userId = 'user_1';
  const systemName = 'test-system';
  const authenticationLock = {
    signature: { version: '1.0.0', schemaJsonSchema: { type: 'object' } },
  };
  const generateSignature = async () => encodeRight({ userId });
  const clientProps = {
    systemName,
    authenticationLock,
    generateSignature,
  };
  const apiUrl = 'https://api.example';
  const publishableKey = 'pk_test';
  const TestLayer = Layer.mergeAll(
    Layer.succeed(ZerospinApiUrl, apiUrl),
    Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
  );

  beforeEach(() => {
    newMessagePortRpcSession.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails when SharedWorker is unavailable', async () => {
    vi.stubGlobal('SharedWorker', undefined);
    vi.stubGlobal('MessagePort', function MessagePort() {
      return undefined;
    });

    const { acquireUserPartitionRepo } =
      await import('./acquireUserPartitionRepo.js');
    await expect(
      Effect.runPromise(
        acquireUserPartitionRepo(clientProps).pipe(Effect.provide(TestLayer)),
      ),
    ).rejects.toThrow(
      'shared-worker-unavailable: SharedWorker is not available; this browser is not compatible',
    );

    expect(newMessagePortRpcSession).not.toHaveBeenCalled();
  });

  it('starts the port with an identity-neutral URL and returns the worker-bound identity', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const port = { start, close, addEventListener, removeEventListener };
    const dispose = vi.fn();
    const SharedWorker = vi.fn(function (
      this: { port: typeof port },
      _url: string | URL,
      _options: SharedWorkerOptions,
    ) {
      this.port = port;
    });
    vi.stubGlobal('SharedWorker', SharedWorker);
    vi.stubGlobal('MessagePort', function MessagePort() {
      return undefined;
    });
    const userReplicaApi = {};
    newMessagePortRpcSession.mockReturnValue({
      getUserPartitionRepo: vi.fn(async () =>
        encodeRight({
          api: userReplicaApi,
          systemId,
          userId,
          mode: 'online',
        }),
      ),
      [Symbol.dispose]: dispose,
    });

    const { acquireUserPartitionRepo } =
      await import('./acquireUserPartitionRepo.js');
    const result = await Effect.runPromise(
      acquireUserPartitionRepo(clientProps).pipe(Effect.provide(TestLayer)),
    );
    const sharedWorkerUrl = SharedWorker.mock.calls[0]?.[0];

    expect(typeof sharedWorkerUrl).toBe('string');
    if (typeof sharedWorkerUrl !== 'string') {
      throw new Error('SharedWorker URL must be an explicit string');
    }
    const parsedSharedWorkerUrl = new URL(
      sharedWorkerUrl,
      'https://app.example',
    );

    expect(SharedWorker).toHaveBeenCalledWith(
      sharedWorkerUrl,
      expect.objectContaining({
        name: 'zerospin:shared-worker',
        type: 'module',
      }),
    );
    expect(
      parsedSharedWorkerUrl.pathname.endsWith('/sharedWorker.bundle.js'),
    ).toBe(true);
    expect(parsedSharedWorkerUrl.searchParams.get('apiUrl')).toBe(apiUrl);
    expect(parsedSharedWorkerUrl.searchParams.get('publishableKey')).toBe(
      publishableKey,
    );
    expect([...parsedSharedWorkerUrl.searchParams.keys()].toSorted()).toEqual([
      'apiUrl',
      'publishableKey',
      'wasmUrl',
    ]);
    expect(
      parsedSharedWorkerUrl.searchParams
        .get('wasmUrl')
        ?.endsWith('/wa-sqlite-async.wasm'),
    ).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(newMessagePortRpcSession).toHaveBeenCalledWith(port);
    expect(addEventListener).toHaveBeenCalledWith(
      'close',
      expect.any(Function),
      { once: true },
    );
    expect(
      newMessagePortRpcSession.mock.results[0]?.value.getUserPartitionRepo,
    ).toHaveBeenCalledWith({
      systemName,
      authenticationLock,
      generateSignature,
    });
    expect(result).toMatchObject({
      api: userReplicaApi,
      systemId,
      userId,
      mode: 'online',
    });
    expect(Object.keys(result).toSorted()).toEqual([
      'api',
      'mode',
      'release',
      'systemId',
      'userId',
    ]);

    await Effect.runPromise(result!.release);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith(
      'close',
      addEventListener.mock.calls[0]?.[1],
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('opens and independently releases one port per caller for the same worker identity', async () => {
    const starts = [vi.fn(), vi.fn()];
    const closes = [vi.fn(), vi.fn()];
    const addEventListeners = [vi.fn(), vi.fn()];
    const removeEventListeners = [vi.fn(), vi.fn()];
    const ports = [
      {
        start: starts[0]!,
        close: closes[0]!,
        addEventListener: addEventListeners[0]!,
        removeEventListener: removeEventListeners[0]!,
      },
      {
        start: starts[1]!,
        close: closes[1]!,
        addEventListener: addEventListeners[1]!,
        removeEventListener: removeEventListeners[1]!,
      },
    ];
    const disposes = [vi.fn(), vi.fn()];
    let portIndex = 0;
    let rpcSessionIndex = 0;
    const SharedWorker = vi.fn(
      function (this: { port: (typeof ports)[number] }) {
        this.port = ports[portIndex++]!;
      },
    );
    vi.stubGlobal('SharedWorker', SharedWorker);
    vi.stubGlobal('MessagePort', function MessagePort() {
      return undefined;
    });
    newMessagePortRpcSession.mockImplementation(() => {
      const index = rpcSessionIndex++;
      return {
        getUserPartitionRepo: vi.fn(async () =>
          encodeRight({ api: {}, systemId, userId, mode: 'online' }),
        ),
        [Symbol.dispose]: disposes[index]!,
      };
    });

    const { acquireUserPartitionRepo } =
      await import('./acquireUserPartitionRepo.js');
    const first = await Effect.runPromise(
      acquireUserPartitionRepo(clientProps).pipe(Effect.provide(TestLayer)),
    );
    const second = await Effect.runPromise(
      acquireUserPartitionRepo(clientProps).pipe(Effect.provide(TestLayer)),
    );

    expect(SharedWorker).toHaveBeenCalledTimes(2);
    expect(newMessagePortRpcSession.mock.calls.map(call => call[0])).toEqual(
      ports,
    );
    expect(starts[0]).toHaveBeenCalledTimes(1);
    expect(starts[1]).toHaveBeenCalledTimes(1);

    await Effect.runPromise(first.release);
    expect(disposes[0]).toHaveBeenCalledTimes(1);
    expect(closes[0]).toHaveBeenCalledTimes(1);
    expect(disposes[1]).not.toHaveBeenCalled();
    expect(closes[1]).not.toHaveBeenCalled();

    await Effect.runPromise(second.release);
    expect(disposes[1]).toHaveBeenCalledTimes(1);
    expect(closes[1]).toHaveBeenCalledTimes(1);
  });

  it('disposes pending rpc when the SharedWorker port closes', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const port = { start, close, addEventListener, removeEventListener };
    const dispose = vi.fn();
    const SharedWorker = vi.fn(function (
      this: { port: typeof port },
      _url: string | URL,
      _options: SharedWorkerOptions,
    ) {
      this.port = port;
    });
    vi.stubGlobal('SharedWorker', SharedWorker);
    vi.stubGlobal('MessagePort', function MessagePort() {
      return undefined;
    });
    newMessagePortRpcSession.mockReturnValue({
      getUserPartitionRepo: vi.fn(async () =>
        encodeRight({ api: {}, systemId, userId, mode: 'online' }),
      ),
      [Symbol.dispose]: dispose,
    });

    const { acquireUserPartitionRepo } =
      await import('./acquireUserPartitionRepo.js');
    const result = await Effect.runPromise(
      acquireUserPartitionRepo(clientProps).pipe(Effect.provide(TestLayer)),
    );
    const closeListener = addEventListener.mock.calls[0]?.[1];
    if (typeof closeListener !== 'function') {
      throw new Error('SharedWorker session must listen for port closure');
    }

    closeListener(new Event('close'));

    expect(dispose).toHaveBeenCalledTimes(1);
    await Effect.runPromise(result.release);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith('close', closeListener);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps the page session alive for persisted pagehide and releases it on the final pagehide', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const port = { start, close, addEventListener, removeEventListener };
    const addPageEventListener = vi.fn();
    const removePageEventListener = vi.fn();
    const dispose = vi.fn();
    const SharedWorker = vi.fn(function (this: { port: typeof port }) {
      this.port = port;
    });
    vi.stubGlobal('SharedWorker', SharedWorker);
    vi.stubGlobal('MessagePort', function MessagePort() {
      return undefined;
    });
    vi.stubGlobal('addEventListener', addPageEventListener);
    vi.stubGlobal('removeEventListener', removePageEventListener);
    newMessagePortRpcSession.mockReturnValue({
      getUserPartitionRepo: vi.fn(async () =>
        encodeRight({ api: {}, systemId, userId, mode: 'online' }),
      ),
      [Symbol.dispose]: dispose,
    });

    const { acquireUserPartitionRepo } =
      await import('./acquireUserPartitionRepo.js');
    const result = await Effect.runPromise(
      acquireUserPartitionRepo(clientProps).pipe(Effect.provide(TestLayer)),
    );
    const pagehideListener = addPageEventListener.mock.calls[0]?.[1];
    if (typeof pagehideListener !== 'function') {
      throw new Error('SharedWorker session must listen for pagehide');
    }

    const persistedPagehide = new Event('pagehide');
    Object.defineProperty(persistedPagehide, 'persisted', { value: true });
    pagehideListener(persistedPagehide);

    expect(dispose).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(removePageEventListener).not.toHaveBeenCalled();

    const finalPagehide = new Event('pagehide');
    Object.defineProperty(finalPagehide, 'persisted', { value: false });
    pagehideListener(finalPagehide);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(removePageEventListener).toHaveBeenCalledWith(
      'pagehide',
      pagehideListener,
    );

    await Effect.runPromise(result.release);
    await Effect.runPromise(result.release);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith(
      'close',
      addEventListener.mock.calls[0]?.[1],
    );
  });

  it('closes the port when opening rpc fails', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const port = { start, close, addEventListener, removeEventListener };
    const SharedWorker = vi.fn(function (
      this: { port: typeof port },
      _url: URL,
      _options: SharedWorkerOptions,
    ) {
      this.port = port;
    });
    vi.stubGlobal('SharedWorker', SharedWorker);
    vi.stubGlobal('MessagePort', function MessagePort() {
      return undefined;
    });
    newMessagePortRpcSession.mockImplementation(() => {
      throw new Error('open failed');
    });

    const { acquireUserPartitionRepo } =
      await import('./acquireUserPartitionRepo.js');
    await expect(
      Effect.runPromise(
        acquireUserPartitionRepo(clientProps).pipe(Effect.provide(TestLayer)),
      ),
    ).rejects.toThrow(
      'failed-to-connect-shared-worker: Failed to connect to shared worker',
    );

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('preserves a domain handshake failure while disposing its rpc session and port', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const port = { start, close, addEventListener, removeEventListener };
    const dispose = vi.fn();
    const SharedWorker = vi.fn(function (this: { port: typeof port }) {
      this.port = port;
    });
    vi.stubGlobal('SharedWorker', SharedWorker);
    vi.stubGlobal('MessagePort', function MessagePort() {
      return undefined;
    });
    newMessagePortRpcSession.mockReturnValue({
      getUserPartitionRepo: vi.fn(async () =>
        encodeLeft(
          new ZerospinError({
            code: 'shared-worker-handshake-test-failed',
            message: 'The worker rejected its root handshake',
          }),
        ),
      ),
      [Symbol.dispose]: dispose,
    });

    const { acquireUserPartitionRepo } =
      await import('./acquireUserPartitionRepo.js');
    await expect(
      Effect.runPromise(
        acquireUserPartitionRepo(clientProps).pipe(Effect.provide(TestLayer)),
      ),
    ).rejects.toThrow('shared-worker-handshake-test-failed');

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns the bound UserPartitionRepo and its diagnostics', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const port = { start, close, addEventListener, removeEventListener };
    const dispose = vi.fn();
    const userReplicaApi = {
      listAggregateFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const sharedWorkerApi = {
      getUserPartitionRepo: vi.fn(async () =>
        encodeRight({
          api: userReplicaApi,
          systemId,
          userId,
          mode: 'existing-only',
        }),
      ),
      [Symbol.dispose]: dispose,
    };
    const SharedWorker = vi.fn(function (
      this: { port: typeof port },
      _url: URL,
      _options: SharedWorkerOptions,
    ) {
      this.port = port;
    });

    vi.stubGlobal('SharedWorker', SharedWorker);
    vi.stubGlobal('MessagePort', function MessagePort() {
      return undefined;
    });
    newMessagePortRpcSession.mockReturnValue(sharedWorkerApi);

    const { acquireUserPartitionRepo } =
      await import('./acquireUserPartitionRepo.js');
    const result = await Effect.runPromise(
      acquireUserPartitionRepo(clientProps).pipe(Effect.provide(TestLayer)),
    );

    await expect(result.api.listAggregateFrontendReplicas()).resolves.toEqual(
      encodeRight([]),
    );
    await expect(result.api.listServiceFrontendReplicas()).resolves.toEqual(
      encodeRight([]),
    );
    expect(sharedWorkerApi.getUserPartitionRepo).toHaveBeenCalledWith({
      systemName,
      authenticationLock,
      generateSignature,
    });
    expect(result).toMatchObject({
      api: userReplicaApi,
      systemId,
      userId,
      mode: 'existing-only',
    });
    expect(newMessagePortRpcSession).toHaveBeenCalledWith(port);
    expect(start).toHaveBeenCalledTimes(1);

    await Effect.runPromise(result.release);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
