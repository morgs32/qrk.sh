import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newMessagePortRpcSession = vi.hoisted(() => vi.fn());
const addEventListener = vi.hoisted(() => vi.fn());
const makeIdbSQLite3 = vi.hoisted(() => vi.fn(async () => ({})));
const migrateUserDbAsync = vi.hoisted(() => vi.fn());
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
const stagedCommands = vi.hoisted(() => [
  {
    id: 'cmd_1',
    commandName: 'noop',
    payload: '{}',
    systemName: 'sys_1',
    version: '1.0.0',
    accountId: 'acct_1',
    accountName: 'main',
    frontendName: 'default',
    actorId: 'usr_1',
    actorName: 'shopper',
    sessionId: 'ses_1',
    status: 'staged',
    stagedCursor: 'staged_1',
    stagedAt: new Date(),
    pushedCursor: null,
  },
]);
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

vi.mock('./migrateUserDbAsync.ts', async () => {
  const { Effect } = await import('effect');
  migrateUserDbAsync.mockImplementation(() => Effect.void);
  return {
    migrateUserDbAsync,
  };
});

describe('makeSharedWorkerHost', () => {
  beforeEach(() => {
    addEventListener.mockReset();
    newMessagePortRpcSession.mockReset();
    makeIdbSQLite3.mockClear();
    makeAsyncWaSqliteDrizzle.mockClear();
    migrateUserDbAsync.mockClear();
    allReplicas.mockClear();
    vi.stubGlobal('addEventListener', addEventListener);
    vi.stubGlobal('location', {
      href: 'https://worker.example/sharedWorker.bundle.js?systemId=sys_1&generationId=gen_1&wasmUrl=https%3A%2F%2Fworker.example%2Fwa-sqlite-async.wasm',
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
      'SharedWorker URL is missing systemId, generationId, or wasmUrl search params',
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

  it('returns a user api that lists frontend replicas', async () => {
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
          getUserApi(props: { userId: string }): Promise<{
            listFrontendReplicas(): Promise<readonly unknown[]>;
          }>;
        }
      | undefined;
    expect(systemApi).toBeDefined();

    const userApi = await systemApi!.getUserApi({ userId: 'user_1' });
    await expect(userApi.listFrontendReplicas()).resolves.toEqual(replicaRows);
    expect(makeIdbSQLite3).toHaveBeenCalledWith({
      databaseName: 'user.db',
      vfsName: 'zerospin/sys_1/gen_1/users/user_1',
      wasmUrl: 'https://worker.example/wa-sqlite-async.wasm',
    });
    expect(migrateUserDbAsync).toHaveBeenCalledTimes(1);
    channel.port1.close();
    channel.port2.close();
  });

  it('subscribes to staged commands and dispatches to the callback from the shared worker', async () => {
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
          getUserApi(props: { userId: string }): Promise<{
            subscribe(props: {
              handleStagedCommands: (
                stagedCommands: readonly unknown[],
              ) => Promise<unknown>;
            }): Promise<unknown>;
            handleStagedCommands(
              stagedCommands: readonly unknown[],
            ): Promise<unknown>;
            listFrontendReplicas(): Promise<readonly unknown[]>;
          }>;
        }
      | undefined;

    expect(systemApi).toBeDefined();

    const callback = vi.fn(async () => encodeRight(undefined));
    const userApi = await systemApi!.getUserApi({ userId: 'user_1' });
    await userApi.subscribe({
      handleStagedCommands: callback,
    });
    await expect(userApi.handleStagedCommands(stagedCommands)).resolves.toEqual(
      encodeRight(undefined),
    );

    expect(callback).toHaveBeenCalledWith(stagedCommands);
    await expect(userApi.handleStagedCommands([])).resolves.toEqual(
      encodeRight(undefined),
    );
    channel.port1.close();
    channel.port2.close();
  });
});
