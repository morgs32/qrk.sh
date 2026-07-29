import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newMessagePortRpcSession = vi.hoisted(() => vi.fn());

vi.mock('capnweb', () => ({
  newMessagePortRpcSession,
}));

describe('makeSharedWorkerSession', () => {
  const systemId = 'sys_1';
  const generationId = 'gen_1';
  const apiUrl = 'https://api.example';
  const publishableKey = 'pk_test';

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

    const { makeSharedWorkerSession } =
      await import('./makeSharedWorkerSession.js');
    await expect(
      Effect.runPromise(
        makeSharedWorkerSession({
          systemId,
          generationId,
          apiUrl,
          publishableKey,
        }),
      ),
    ).rejects.toThrow(
      'shared-worker-unavailable: SharedWorker is not available; this browser is not compatible',
    );

    expect(newMessagePortRpcSession).not.toHaveBeenCalled();
  });

  it('starts the port and opens root rpc with system identity on the worker url', async () => {
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
      [Symbol.dispose]: dispose,
    });

    const { makeSharedWorkerSession } =
      await import('./makeSharedWorkerSession.js');
    const result = await Effect.runPromise(
      makeSharedWorkerSession({
        systemId,
        generationId,
        apiUrl,
        publishableKey,
      }),
    );
    const sharedWorkerUrl = SharedWorker.mock.calls[0]?.[0];

    expect(typeof sharedWorkerUrl).toBe('string');
    if (typeof sharedWorkerUrl !== 'string') {
      throw new Error('SharedWorker URL must include identity in a string');
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
    expect(parsedSharedWorkerUrl.searchParams.get('systemId')).toBe(systemId);
    expect(parsedSharedWorkerUrl.searchParams.get('generationId')).toBe(
      generationId,
    );
    expect(parsedSharedWorkerUrl.searchParams.get('apiUrl')).toBe(apiUrl);
    expect(parsedSharedWorkerUrl.searchParams.get('publishableKey')).toBe(
      publishableKey,
    );
    expect(parsedSharedWorkerUrl.searchParams.get('systemRelease')).toBeNull();
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

    await Effect.runPromise(result!.release);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith(
      'close',
      addEventListener.mock.calls[0]?.[1],
    );
    expect(close).toHaveBeenCalledTimes(1);
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
      [Symbol.dispose]: dispose,
    });

    const { makeSharedWorkerSession } =
      await import('./makeSharedWorkerSession.js');
    const result = await Effect.runPromise(
      makeSharedWorkerSession({
        systemId,
        generationId,
        apiUrl,
        publishableKey,
      }),
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

  it('closes the port when opening rpc fails', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const port = { start, close };
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

    const { makeSharedWorkerSession } =
      await import('./makeSharedWorkerSession.js');
    await expect(
      Effect.runPromise(
        makeSharedWorkerSession({
          systemId,
          generationId,
          apiUrl,
          publishableKey,
        }),
      ),
    ).rejects.toThrow(
      'failed-to-connect-shared-worker: Failed to connect to shared worker',
    );

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns the shared worker api and the separate partition diagnostics', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const port = { start, close, addEventListener, removeEventListener };
    const dispose = vi.fn();
    const partitionApi = {
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const sharedWorkerApi = {
      getPartitionApi: vi.fn(async () => partitionApi),
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

    const { makeSharedWorkerSession } =
      await import('./makeSharedWorkerSession.js');
    const result = await Effect.runPromise(
      makeSharedWorkerSession({
        systemId,
        generationId,
        apiUrl,
        publishableKey,
      }),
    );

    const sharedWorkerSession = await result.api.getPartitionApi({
      partitionKey: 'partition_1',
    });
    await expect(
      sharedWorkerSession.listAccountFrontendReplicas(),
    ).resolves.toEqual(encodeRight([]));
    await expect(
      sharedWorkerSession.listServiceFrontendReplicas(),
    ).resolves.toEqual(encodeRight([]));
    expect(sharedWorkerApi.getPartitionApi).toHaveBeenCalledWith({
      partitionKey: 'partition_1',
    });
    expect(newMessagePortRpcSession).toHaveBeenCalledWith(port);
    expect(start).toHaveBeenCalledTimes(1);

    await Effect.runPromise(result.release);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
