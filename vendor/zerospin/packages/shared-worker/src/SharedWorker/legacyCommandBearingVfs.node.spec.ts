import { makeInMemorySqlJsDatabase } from '@zerospin/core/drizzle/makeInMemorySqlJsDatabase';
import { makeTableMigrationStatements } from '@zerospin/core/drizzle/makeTableMigrationSQL';
import { main } from '@zerospin/core/fixtures/system';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeFrontendSpecHash } from '@zerospin/core/frontendController/makeFrontendSpecHash';
import { FrontendSyncStateSchema } from '@zerospin/core/session/FrontendBlockSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { drizzle } from 'drizzle-orm/sql-js';
import { Effect, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AccountFrontendReplicaProviderApi,
  PartitionApi,
} from '../makeSharedWorkerSession.ts';

import { partitionMigrations } from './drizzle/partition/migrations.ts';

const accountFrontendSpec = makeFrontendControllerSpec(main);
const accountState = Schema.decodeUnknownSync(FrontendSyncStateSchema)({
  accountId: 'acct_legacy',
  actorId: 'actr_legacy',
  systemId: 'sys_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker-1',
  accountName: main.accountName,
  actorName: main.actorName,
  frontendName: main.frontendName,
  frontendIndex: 3,
  lastRebasedPushedCursor: null,
  pushedCommands: [],
  resources: [],
  executedPushedCommands: [],
  failedPushedCommands: [],
});

const addEventListener = vi.hoisted(() => vi.fn());
const connectListeners = vi.hoisted(
  () => new Map<string, (event: MessageEvent) => void>(),
);
const systemApis = vi.hoisted(
  () =>
    new Map<
      number,
      {
        getPartitionApi(props: { partitionKey: string }): Promise<PartitionApi>;
        [Symbol.dispose](): void;
      }
    >(),
);
const newMessagePortRpcSession = vi.hoisted(() => vi.fn());
const makeIdbSQLite3 = vi.hoisted(() => vi.fn());
const makeAsyncWaSqliteDrizzle = vi.hoisted(() => vi.fn());
const makeTxAsync = vi.hoisted(() => vi.fn());
const migrateDbAsync = vi.hoisted(() => vi.fn());
const migratePartitionDbAsync = vi.hoisted(() => vi.fn());
const databaseClients = vi.hoisted(
  () =>
    new Map<string, Awaited<ReturnType<typeof makeInMemorySqlJsDatabase>>>(),
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

vi.mock('../drizzle/makeTxAsync.ts', () => ({
  makeTxAsync,
}));

vi.mock('../drizzle/migrateDbAsync.ts', () => ({
  migrateDbAsync,
}));

vi.mock('./migratePartitionDbAsync.ts', () => ({
  migratePartitionDbAsync,
}));

describe('legacy command-bearing VFS quarantine', () => {
  beforeEach(() => {
    vi.resetModules();
    addEventListener.mockReset();
    connectListeners.clear();
    systemApis.clear();
    newMessagePortRpcSession.mockReset();
    makeIdbSQLite3.mockReset();
    makeAsyncWaSqliteDrizzle.mockReset();
    makeTxAsync.mockReset();
    migrateDbAsync.mockReset();
    migratePartitionDbAsync.mockReset();

    addEventListener.mockImplementation(
      (eventName: string, listener: (event: MessageEvent) => void) => {
        connectListeners.set(eventName, listener);
      },
    );
    newMessagePortRpcSession.mockImplementation(
      (
        _port: MessagePort,
        api: {
          getPartitionApi(props: {
            partitionKey: string;
          }): Promise<PartitionApi>;
          [Symbol.dispose](): void;
        },
      ) => {
        systemApis.set(systemApis.size, api);
        return {};
      },
    );
    makeIdbSQLite3.mockImplementation(
      async (props: {
        databaseName: string;
        vfsName: string;
        wasmUrl: string;
      }) => {
        const databaseKey = `${props.vfsName}/${props.databaseName}`;
        const existing = databaseClients.get(databaseKey);
        if (existing !== undefined) return existing;
        const database = await makeInMemorySqlJsDatabase();
        databaseClients.set(databaseKey, database);
        return database;
      },
    );
    makeAsyncWaSqliteDrizzle.mockImplementation((client, config) => {
      const db = drizzle(client, {
        schema: config.schema,
        relations: config.relations,
      });
      Reflect.set(db, '$client', client);
      return db;
    });
    makeTxAsync.mockImplementation(props => props.program({ tx: props.db }));
    migratePartitionDbAsync.mockImplementation(props =>
      Effect.sync(() => {
        const client = Reflect.get(props.db, '$client');
        for (const migration of partitionMigrations) {
          for (const statement of migration.sql) {
            client.run(statement);
          }
        }
      }),
    );
    migrateDbAsync.mockImplementation(props =>
      Effect.sync(() => {
        const client = Reflect.get(props.db, '$client');
        for (const drizzleSchema of Object.values(props.schema)) {
          for (const statement of makeTableMigrationStatements(drizzleSchema)) {
            client.run(statement);
          }
        }
      }),
    );

    vi.stubGlobal('addEventListener', addEventListener);
    vi.stubGlobal('location', {
      href: 'https://worker.example/sharedWorker.bundle.js?systemId=sys_1&generationId=gen_1&apiUrl=https%3A%2F%2Fapi.example&publishableKey=pk_test&wasmUrl=https%3A%2F%2Fworker.example%2Fwa-sqlite-async.wasm',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const database of databaseClients.values()) {
      database.close();
    }
    databaseClients.clear();
  });

  it('rejects cached acquisition without opening, decoding, rewriting, or deleting corrupt legacy command bytes', async () => {
    const legacyDatabaseKey =
      'zerospin/sys_1/gen_1/partitions/partition_1/legacy-command-bearing.db';
    const legacyDatabase = await makeInMemorySqlJsDatabase();
    legacyDatabase.run(`
      CREATE TABLE stagedCommands (
        id text PRIMARY KEY NOT NULL,
        command text NOT NULL,
        mutations text NOT NULL
      );
    `);
    legacyDatabase.run(
      `INSERT INTO stagedCommands (id, command, mutations) VALUES (?, ?, ?)`,
      ['cmd_legacy_unique', '{corrupt-command-json', '{corrupt-mutation-json'],
    );
    databaseClients.set(legacyDatabaseKey, legacyDatabase);
    const bytesBeforeAcquisition = legacyDatabase.export();

    const { makeSharedWorkerHost } = await import('./makeSharedWorkerHost.js');
    makeSharedWorkerHost();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const partitionApi = await systemApi.getPartitionApi({
      partitionKey: 'partition_1',
    });
    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    partitionDatabase.run(
      `INSERT INTO replicas (
        id, accountId, accountName, actorId, actorName,
        frontendName, frontendVersion, databaseName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'frp_legacy_unique',
        accountState.accountId,
        accountState.accountName,
        accountState.actorId,
        accountState.actorName,
        accountState.frontendName,
        accountFrontendSpec.version,
        'legacy-command-bearing.db',
      ],
    );

    const provider: AccountFrontendReplicaProviderApi = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-must-not-be-minted',
          systemId: accountState.systemId,
          generationId: accountState.generationId,
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
        }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
      ),
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    };
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );

    const encodedAcquisition = await partitionApi.acquireFrontendReplica({
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      frontendName: accountState.frontendName,
      frontendVersion: accountFrontendSpec.version,
      frontendSpec: accountFrontendSpec,
      frontendSpecHash: accountFrontendSpecHash,
      authority: 'cached-offline',
      role: 'active',
      provider,
    });
    await expect(
      Effect.runPromise(decodeRpc(encodedAcquisition)),
    ).rejects.toThrow('cached-account-frontend-replica-unavailable');

    const bytesAfterAcquisition = legacyDatabase.export();

    expect(
      partitionDatabase.exec(
        'SELECT id, databaseName FROM replicas ORDER BY id',
      )[0]?.values,
    ).toEqual([['frp_legacy_unique', 'legacy-command-bearing.db']]);
    expect(
      legacyDatabase.exec(
        'SELECT id, command, mutations FROM stagedCommands ORDER BY id',
      )[0]?.values,
    ).toEqual([
      ['cmd_legacy_unique', '{corrupt-command-json', '{corrupt-mutation-json'],
    ]);
    expect(bytesAfterAcquisition).toEqual(bytesBeforeAcquisition);
    expect(provider.getFrontendState).not.toHaveBeenCalled();
    expect(provider.createFrontendWebSocketTicket).not.toHaveBeenCalled();
    expect(provider.pushCommands).not.toHaveBeenCalled();
    expect(makeIdbSQLite3).toHaveBeenCalledOnce();
    expect(makeIdbSQLite3).toHaveBeenCalledWith({
      databaseName: 'partition.db',
      vfsName: 'zerospin/sys_1/gen_1/partitions/partition_1',
      wasmUrl: 'https://worker.example/wa-sqlite-async.wasm',
    });

    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });
});
