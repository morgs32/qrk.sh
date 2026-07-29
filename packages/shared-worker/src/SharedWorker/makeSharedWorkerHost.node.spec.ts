import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newMessagePortRpcSession = vi.hoisted(() => vi.fn());
const addEventListener = vi.hoisted(() => vi.fn());
const makeIdbSQLite3 = vi.hoisted(() => vi.fn(async () => ({})));
const migratePartitionDbAsync = vi.hoisted(() => vi.fn());
const replicaRows = vi.hoisted(() => [
  {
    accountId: 'acct_1',
    accountName: 'main',
    actorId: 'usr_1',
    actorName: 'shopper',
    frontendName: 'default',
    frontendVersion: '1.0.0',
    databaseName: 'replica.db',
  },
]);
const allReplicas = vi.hoisted(() => vi.fn(async () => replicaRows));
const makeAsyncWaSqliteDrizzle = vi.hoisted(() =>
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          all: allReplicas,
        })),
      })),
    })),
  })),
);

vi.mock('capnweb', () => ({
  RpcTarget: class RpcTarget {},
  newMessagePortRpcSession,
}));

vi.mock('../drizzle/makeIdbSQLite3.ts', () => ({
  makeIdbSQLite3,
}));

vi.mock('../drizzle/makeAsyncWaSqliteDrizzle.ts', () => ({
  makeAsyncWaSqliteDrizzle,
}));

vi.mock('./migratePartitionDbAsync.ts', async () => {
  const { Effect } = await import('effect');
  migratePartitionDbAsync.mockImplementation(() => Effect.void);
  return {
    migratePartitionDbAsync,
  };
});

describe('makeSharedWorkerHost', () => {
  beforeEach(() => {
    addEventListener.mockReset();
    newMessagePortRpcSession.mockReset();
    makeIdbSQLite3.mockClear();
    makeAsyncWaSqliteDrizzle.mockClear();
    migratePartitionDbAsync.mockClear();
    allReplicas.mockClear();
    vi.stubGlobal('addEventListener', addEventListener);
    vi.stubGlobal('location', {
      href: 'https://worker.example/sharedWorker.bundle.js?systemId=sys_1&generationId=gen_1&apiUrl=https%3A%2F%2Fapi.example&publishableKey=pk_test&wasmUrl=https%3A%2F%2Fworker.example%2Fwa-sqlite-async.wasm',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects the removed systemRelease query param without generationId', async () => {
    vi.stubGlobal('location', {
      href: 'https://worker.example/sharedWorker.bundle.js?systemId=sys_1&systemRelease=1.0.0&wasmUrl=https%3A%2F%2Fworker.example%2Fwa-sqlite-async.wasm',
    });

    const { makeSharedWorkerHost } = await import('./makeSharedWorkerHost.js');
    expect(() => makeSharedWorkerHost()).toThrow(
      'SharedWorker URL is missing systemId, generationId, apiUrl, publishableKey, or wasmUrl search params',
    );
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('registers one rpc session per shared worker port', async () => {
    const { makeSharedWorkerHost } = await import('./makeSharedWorkerHost.js');
    makeSharedWorkerHost();
    const connectHandler = addEventListener.mock.calls[0]?.[1] as
      | ((event: MessageEvent) => void)
      | undefined;
    expect(addEventListener.mock.calls[0]?.[0]).toBe('connect');
    expect(connectHandler).toBeDefined();

    const channel = new MessageChannel();
    connectHandler!(
      new MessageEvent('connect', {
        ports: [channel.port1],
      }),
    );
    connectHandler!(
      new MessageEvent('connect', {
        ports: [channel.port2],
      }),
    );

    expect(newMessagePortRpcSession).toHaveBeenCalledTimes(2);
    channel.port1.close();
    channel.port2.close();
  });

  it('exposes separate account and service APIs without the removed combined subscription surface', async () => {
    const { makeSharedWorkerHost } = await import('./makeSharedWorkerHost.js');
    makeSharedWorkerHost();
    const connectHandler = addEventListener.mock.calls[0]?.[1] as
      | ((event: MessageEvent) => void)
      | undefined;
    expect(connectHandler).toBeDefined();

    const channel = new MessageChannel();
    connectHandler!(
      new MessageEvent('connect', {
        ports: [channel.port1],
      }),
    );

    const systemApi = newMessagePortRpcSession.mock.calls[0]?.[1] as
      | {
          getPartitionApi(props: {
            partitionKey: string;
          }): Promise<Record<string, unknown>>;
        }
      | undefined;

    expect(systemApi).toBeDefined();

    const partitionApi = await systemApi!.getPartitionApi({
      partitionKey: 'partition_1',
    });
    expect('acquireFrontendReplica' in partitionApi).toBe(true);
    expect('acquireServiceFrontendReplica' in partitionApi).toBe(true);
    expect('listAccountFrontendReplicas' in partitionApi).toBe(true);
    expect('listServiceFrontendReplicas' in partitionApi).toBe(true);
    expect('listLegacyFrontendReplicas' in partitionApi).toBe(false);
    expect('subscribe' in partitionApi).toBe(false);
    expect('handleStagedCommands' in partitionApi).toBe(false);
    expect('listFrontendReplicas' in partitionApi).toBe(false);
    channel.port1.close();
    channel.port2.close();
  });
});
