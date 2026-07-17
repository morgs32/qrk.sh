import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newMessagePortRpcSession = vi.hoisted(() => vi.fn());

vi.mock('capnweb', () => ({
  newMessagePortRpcSession,
}));

describe('makeSharedWorkerSession', () => {
  const systemId = 'sys_1';
  const generationId = 'gen_1';

  const replicaRows = [
    {
      accountId: 'acct_1',
      accountName: 'main',
      actorId: 'usr_1',
      actorName: 'shopper',
      frontendName: 'default',
      frontendVersion: '1.0.0',
      databaseName: 'replica.db',
    },
  ];

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
      Effect.runPromise(makeSharedWorkerSession({ systemId, generationId })),
    ).rejects.toThrow(
      'shared-worker-unavailable: SharedWorker is not available; this browser is not compatible',
    );

    expect(newMessagePortRpcSession).not.toHaveBeenCalled();
  });

  it('starts the port and opens root rpc with system identity on the worker url', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const port = { start, close };
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
      makeSharedWorkerSession({ systemId, generationId }),
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
    expect(parsedSharedWorkerUrl.searchParams.get('systemRelease')).toBeNull();
    expect(
      parsedSharedWorkerUrl.searchParams
        .get('wasmUrl')
        ?.endsWith('/wa-sqlite-async.wasm'),
    ).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(newMessagePortRpcSession).toHaveBeenCalledWith(port);

    await Effect.runPromise(result!.release);

    expect(dispose).toHaveBeenCalledTimes(1);
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
      Effect.runPromise(makeSharedWorkerSession({ systemId, generationId })),
    ).rejects.toThrow(
      'failed-to-connect-shared-worker: Failed to connect to shared worker',
    );

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns shared worker api and can call getUserApi().listFrontendReplicas()', async () => {
    const start = vi.fn();
    const close = vi.fn();
    const port = { start, close };
    const dispose = vi.fn();
    const userApi = {
      listFrontendReplicas: vi.fn(async () => replicaRows),
    };
    const sharedWorkerApi = {
      getUserApi: vi.fn(async () => userApi),
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
      makeSharedWorkerSession({ systemId, generationId }),
    );

    const sharedWorkerSession = await result.api.getUserApi({
      userId: 'user_1',
    });
    await expect(sharedWorkerSession.listFrontendReplicas()).resolves.toEqual(
      replicaRows,
    );

    expect(sharedWorkerApi.getUserApi).toHaveBeenCalledWith({
      userId: 'user_1',
    });
    expect(newMessagePortRpcSession).toHaveBeenCalledWith(port);
    expect(start).toHaveBeenCalledTimes(1);

    await Effect.runPromise(result.release);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
