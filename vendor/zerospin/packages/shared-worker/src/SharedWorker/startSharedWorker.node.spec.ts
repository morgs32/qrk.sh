import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newMessagePortRpcSession = vi.hoisted(() => vi.fn());
const addEventListener = vi.hoisted(() => vi.fn());
const sharedWorkerApis = vi.hoisted(
  () =>
    new Array<{
      props: Record<string, unknown>;
      dispose: ReturnType<typeof vi.fn>;
    }>(),
);
const SharedWorkerApi = vi.hoisted(() =>
  vi.fn(function (
    this: { [Symbol.dispose](): void },
    props: Record<string, unknown>,
  ) {
    const dispose = vi.fn();
    this[Symbol.dispose] = dispose;
    sharedWorkerApis.push({ props, dispose });
  }),
);

vi.mock('capnweb', async importOriginal => ({
  ...(await importOriginal()),
  newMessagePortRpcSession,
}));

vi.mock('./SharedWorkerApi/SharedWorkerApi.ts', () => ({
  SharedWorkerApi,
}));

describe('startSharedWorker', () => {
  beforeEach(() => {
    addEventListener.mockReset();
    newMessagePortRpcSession.mockReset();
    SharedWorkerApi.mockClear();
    sharedWorkerApis.length = 0;
    vi.stubGlobal('addEventListener', addEventListener);
    vi.stubGlobal('location', {
      href: 'https://worker.example/sharedWorker.bundle.js?apiUrl=https%3A%2F%2Fapi.example&publishableKey=pk_test&wasmUrl=https%3A%2F%2Fworker.example%2Fwa-sqlite-async.wasm',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a host URL missing identity-neutral connection configuration', async () => {
    vi.stubGlobal('location', {
      href: 'https://worker.example/sharedWorker.bundle.js?systemId=sys_1&userId=user_1',
    });

    const { startSharedWorker } = await import('./startSharedWorker.js');
    expect(() => startSharedWorker()).toThrow(
      'SharedWorker URL is missing apiUrl, publishableKey, or wasmUrl search params',
    );
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('creates one unbound API per port while sharing only host persistence maps', async () => {
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connectHandler = addEventListener.mock.calls[0]?.[1];
    expect(addEventListener.mock.calls[0]?.[0]).toBe('connect');
    expect(typeof connectHandler).toBe('function');

    const firstChannel = new MessageChannel();
    const secondChannel = new MessageChannel();
    connectHandler(
      new MessageEvent('connect', { ports: [firstChannel.port1] }),
    );
    connectHandler(
      new MessageEvent('connect', { ports: [secondChannel.port1] }),
    );

    expect(SharedWorkerApi).toHaveBeenCalledTimes(2);
    expect(newMessagePortRpcSession).toHaveBeenNthCalledWith(
      1,
      firstChannel.port1,
      expect.any(Object),
    );
    expect(newMessagePortRpcSession).toHaveBeenNthCalledWith(
      2,
      secondChannel.port1,
      expect.any(Object),
    );
    const firstProps = sharedWorkerApis[0]?.props;
    const secondProps = sharedWorkerApis[1]?.props;
    expect(firstProps).toBeDefined();
    expect(secondProps).toBeDefined();
    expect(firstProps).not.toHaveProperty('systemId');
    expect(firstProps).not.toHaveProperty('userId');
    expect(firstProps).toMatchObject({
      sharedWorkerApiUrl: 'https://api.example',
      sharedWorkerPublishableKey: 'pk_test',
      sharedWorkerWasmUrl: 'https://worker.example/wa-sqlite-async.wasm',
    });
    expect(firstProps?.ownerToken).not.toBe(secondProps?.ownerToken);
    expect(firstProps?.userReplicaStores).toBe(secondProps?.userReplicaStores);
    expect(firstProps?.aggregateReplicaRuntimes).toBe(
      secondProps?.aggregateReplicaRuntimes,
    );
    expect(firstProps?.serviceReplicaRuntimes).toBe(
      secondProps?.serviceReplicaRuntimes,
    );

    firstChannel.port1.dispatchEvent(new Event('messageerror'));
    expect(sharedWorkerApis[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(sharedWorkerApis[1]?.dispose).not.toHaveBeenCalled();

    firstChannel.port1.close();
    firstChannel.port2.close();
    secondChannel.port1.close();
    secondChannel.port2.close();
  });
});
