import { StagedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { EncodedFrontendMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeInMemorySqlJsDatabase } from '@zerospin/core/drizzle/makeInMemorySqlJsDatabase';
import { makeTableMigrationStatements } from '@zerospin/core/drizzle/makeTableMigrationSQL';
import { main } from '@zerospin/core/fixtures/system';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeFrontendSpecHash } from '@zerospin/core/frontendController/makeFrontendSpecHash';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import { ServiceFrontendStateSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import { FrontendSyncStateSchema } from '@zerospin/core/session/FrontendBlockSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { drizzle } from 'drizzle-orm/sql-js';
import { Effect, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AccountFrontendReplicaProviderApi,
  PartitionApi,
  ServiceFrontendReplicaProviderApi,
} from '../makeSharedWorkerSession.ts';

import { partitionMigrations } from './drizzle/partition/migrations.ts';

const accountFrontendSpec = makeFrontendControllerSpec(main);
const serviceFrontend = makeServiceFrontendController({
  systemName: 'system-worker',
  serviceName: 'catalog',
  actorName: 'viewer',
  frontendName: 'catalog',
  version: '1.0.0',
  models: {},
  signature: Schema.Struct({ subject: Schema.String }),
});
const serviceFrontendSpec = makeServiceFrontendControllerSpec(serviceFrontend);

const accountState = Schema.decodeUnknownSync(FrontendSyncStateSchema)({
  accountId: 'acct_1',
  actorId: 'actr_1',
  systemId: 'sys_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker-1',
  accountName: main.accountName,
  actorName: main.actorName,
  frontendName: main.frontendName,
  frontendIndex: 0,
  lastRebasedPushedCursor: null,
  pushedCommands: [],
  resources: [],
  executedPushedCommands: [],
  failedPushedCommands: [],
});

const serviceState = Schema.decodeUnknownSync(ServiceFrontendStateSchema)({
  actorId: 'actr_service',
  systemId: 'sys_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker-1',
  serviceName: serviceFrontend.serviceName,
  actorName: serviceFrontend.actorName,
  frontendName: serviceFrontend.frontendName,
  frontendIndex: 0,
  resources: [],
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
const webSocketInstances = vi.hoisted(
  () =>
    new Array<{
      url: string;
      send(value: string): void;
      close(): void;
      dispatchEvent(event: Event): boolean;
    }>(),
);

vi.mock('capnweb', async importOriginal => ({
  ...(await importOriginal()),
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

describe('makeSharedWorkerHost invariants', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    addEventListener.mockReset();
    connectListeners.clear();
    systemApis.clear();
    newMessagePortRpcSession.mockReset();
    makeIdbSQLite3.mockReset();
    makeAsyncWaSqliteDrizzle.mockReset();
    makeTxAsync.mockReset();
    migrateDbAsync.mockReset();
    migratePartitionDbAsync.mockReset();
    webSocketInstances.length = 0;

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

    const WebSocket = vi.fn(function WebSocket(url: string) {
      const eventTarget = new EventTarget();
      let isClosed = false;
      const socket = {
        url,
        addEventListener: eventTarget.addEventListener.bind(eventTarget),
        send: vi.fn(),
        close: vi.fn(() => {
          if (isClosed) return;
          isClosed = true;
          eventTarget.dispatchEvent(new Event('close'));
        }),
        dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
      };
      webSocketInstances.push(socket);
      return socket;
    });

    vi.stubGlobal('addEventListener', addEventListener);
    vi.stubGlobal('WebSocket', WebSocket);
    vi.stubGlobal('location', {
      href: 'https://worker.example/sharedWorker.bundle.js?systemId=sys_1&generationId=gen_1&apiUrl=https%3A%2F%2Fapi.example&publishableKey=pk_test&wasmUrl=https%3A%2F%2Fworker.example%2Fwa-sqlite-async.wasm',
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const database of databaseClients.values()) {
      database.close();
    }
    databaseClients.clear();
  });

  it('fails over to the next provider and shuts the socket and reconnect down at zero owners', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const firstTicket = vi.fn(async () => {
      throw new Error('first capability closed');
    });
    const secondTicket = vi.fn(async () =>
      encodeRight({
        ticket: 'ticket-second',
        systemId: accountState.systemId,
        generationId: accountState.generationId,
        accountId: accountState.accountId,
        accountName: accountState.accountName,
        actorId: accountState.actorId,
        actorName: accountState.actorName,
        frontendName: accountState.frontendName,
        frontendVersion: accountFrontendSpec.version,
      }),
    );
    const firstProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: firstTicket,
      pushCommands: vi.fn(async () =>
        encodeRight({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
      ),
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;
    const secondProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: secondTicket,
      pushCommands: vi.fn(async () =>
        encodeRight({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
      ),
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;

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
    const secondChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [secondChannel.port1] }));
    const secondSystemApi = systemApis.get(1);
    if (secondSystemApi === undefined) {
      throw new Error('second system api missing');
    }
    const secondPartitionApi = await secondSystemApi.getPartitionApi({
      partitionKey: 'partition_1',
    });

    const firstAcquisition = await Effect.runPromise(
      decodeRpc(
        await secondPartitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: firstProvider,
        }),
      ),
    );
    const secondAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: secondProvider,
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    expect(firstTicket).toHaveBeenCalledTimes(1);
    expect(secondTicket).toHaveBeenCalledTimes(1);
    expect(webSocketInstances[0]?.url).toContain('ticket=ticket-second');
    const ownedDiagnostics = await Effect.runPromise(
      decodeRpc(await partitionApi.listAccountFrontendReplicas()),
    );
    expect(ownedDiagnostics).toMatchObject([{ activeProviderCount: 1 }]);

    webSocketInstances[0]?.dispatchEvent(new Event('close'));
    await vi.advanceTimersByTimeAsync(0);
    await Effect.runPromise(decodeRpc(await firstAcquisition.release()));
    await Effect.runPromise(decodeRpc(await secondAcquisition.release()));
    await vi.advanceTimersByTimeAsync(30_000);

    const diagnostics = await Effect.runPromise(
      decodeRpc(await partitionApi.listAccountFrontendReplicas()),
    );
    expect(diagnostics).toMatchObject([
      {
        activeProviderCount: 0,
        socketState: 'disconnected',
      },
    ]);
    expect(webSocketInstances).toHaveLength(1);

    systemApi[Symbol.dispose]();
    secondSystemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
    secondChannel.port1.close();
    secondChannel.port2.close();
  });

  it('serializes concurrent stages and rejects the stale base index after one durable commit', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-queue',
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
    } satisfies AccountFrontendReplicaProviderApi;
    const firstCommand = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_queue_first',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_queue',
      stagedCursor: 'stcur_queue_1',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const secondCommand = Schema.validateSync(StagedCommandSchema)({
      ...firstCommand,
      id: 'cmd_queue_second',
      stagedCursor: 'stcur_queue_2',
    });
    const firstMutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: firstCommand.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_queue_first',
        operationName: 'create',
        operation: JSON.stringify({ encodedAttributes: { name: 'First' } }),
      },
    ]);
    const secondMutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: secondCommand.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_queue_second',
        operationName: 'create',
        operation: JSON.stringify({ encodedAttributes: { name: 'Second' } }),
      },
    ]);

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));

    const unregisteredChannel = new MessageChannel();
    connect(
      new MessageEvent('connect', { ports: [unregisteredChannel.port1] }),
    );
    const unregisteredSystemApi = systemApis.get(1);
    if (unregisteredSystemApi === undefined) {
      throw new Error('unregistered system api missing');
    }
    const unregisteredPartitionApi =
      await unregisteredSystemApi.getPartitionApi({
        partitionKey: 'partition_1',
      });
    await expect(
      Effect.runPromise(
        decodeRpc(
          await unregisteredPartitionApi.stageFrontendCommand({
            target: {
              accountId: accountState.accountId,
              accountName: accountState.accountName,
              actorId: accountState.actorId,
              actorName: accountState.actorName,
              frontendName: accountState.frontendName,
              frontendVersion: accountFrontendSpec.version,
            },
            baseReplicaIndex: 1,
            command: firstCommand,
            mutations: firstMutations,
          }),
        ),
      ),
    ).rejects.toThrow('account-frontend-stage-owner-not-active');

    const firstStage = partitionApi.stageFrontendCommand({
      target: {
        accountId: accountState.accountId,
        accountName: accountState.accountName,
        actorId: accountState.actorId,
        actorName: accountState.actorName,
        frontendName: accountState.frontendName,
        frontendVersion: accountFrontendSpec.version,
      },
      baseReplicaIndex: 1,
      command: firstCommand,
      mutations: firstMutations,
    });
    const secondStage = partitionApi.stageFrontendCommand({
      target: {
        accountId: accountState.accountId,
        accountName: accountState.accountName,
        actorId: accountState.actorId,
        actorName: accountState.actorName,
        frontendName: accountState.frontendName,
        frontendVersion: accountFrontendSpec.version,
      },
      baseReplicaIndex: 1,
      command: secondCommand,
      mutations: secondMutations,
    });
    const firstResult = Effect.runPromise(decodeRpc(await firstStage));
    const secondResult = Effect.runPromise(decodeRpc(await secondStage));
    const results = await Promise.allSettled([firstResult, secondResult]);

    expect(results[0]).toMatchObject({
      status: 'fulfilled',
      value: { commandId: firstCommand.id, replicaIndex: 2 },
    });
    expect(results[1]?.status).toBe('rejected');
    if (results[1]?.status !== 'rejected') {
      throw new Error('second concurrent stage unexpectedly succeeded');
    }
    expect(String(results[1].reason)).toContain(
      'account-frontend-replica-base-index-stale',
    );
    const state = await Effect.runPromise(
      decodeRpc(await acquisition.getFrontendState()),
    );
    expect(state.replicaIndex).toBe(2);
    expect(state.stagedCommands.map(command => command.id)).toEqual([
      firstCommand.id,
    ]);
    expect(state.resources.map(resource => resource.id)).toEqual([
      'acct_queue_first',
    ]);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    unregisteredSystemApi[Symbol.dispose]();
    unregisteredChannel.port1.close();
    unregisteredChannel.port2.close();
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('resumes an interrupted account commission only after verifying its separate journal', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-account-resume',
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
    } satisfies AccountFrontendReplicaProviderApi;

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
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    partitionDatabase.run(
      `INSERT INTO accountFrontendReplicas (
        id, accountId, accountName, actorId, actorName, frontendName,
        frontendVersion, frontendSpecHash, frontendSpec, sourceTargets, databaseName,
        previousDatabaseNames, status, role, replicaIndex, frontendIndex,
        systemVersion, systemWorkerName, pendingTransition, socketState,
        reconnectAttempt, journalHealth, writeSuspended, lastFailure, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'afrp_interrupted',
        accountState.accountId,
        accountState.accountName,
        accountState.actorId,
        accountState.actorName,
        accountState.frontendName,
        accountFrontendSpec.version,
        accountFrontendSpecHash,
        JSON.stringify(accountFrontendSpec),
        '[]',
        'replica.db',
        '[]',
        'commissioning',
        'active',
        0,
        0,
        accountState.systemVersion,
        accountState.systemWorkerName,
        null,
        'disconnected',
        0,
        'unverified',
        0,
        null,
        now,
        now,
      ],
    );

    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    const diagnostics = await Effect.runPromise(
      decodeRpc(await partitionApi.listAccountFrontendReplicas()),
    );

    expect(provider.getFrontendState).toHaveBeenCalledTimes(1);
    expect(diagnostics).toMatchObject([
      {
        databaseName: 'afrp_interrupted/replica.db',
        status: 'ready',
        journalHealth: 'healthy',
      },
    ]);
    expect(
      partitionDatabase.exec(
        'SELECT id, status, journalHealth FROM accountFrontendReplicas',
      )[0]?.values,
    ).toEqual([['afrp_interrupted', 'ready', 'healthy']]);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('marks a corrupt interrupted account journal and preserves its catalog and database locator', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-account-corrupt',
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
    } satisfies AccountFrontendReplicaProviderApi;

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
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    partitionDatabase.run(
      `INSERT INTO accountFrontendReplicas (
        id, accountId, accountName, actorId, actorName, frontendName,
        frontendVersion, frontendSpecHash, frontendSpec, sourceTargets, databaseName,
        previousDatabaseNames, status, role, replicaIndex, frontendIndex,
        systemVersion, systemWorkerName, pendingTransition, socketState,
        reconnectAttempt, journalHealth, writeSuspended, lastFailure, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'afrp_corrupt',
        accountState.accountId,
        accountState.accountName,
        accountState.actorId,
        accountState.actorName,
        accountState.frontendName,
        accountFrontendSpec.version,
        accountFrontendSpecHash,
        JSON.stringify(accountFrontendSpec),
        '[]',
        'replica.db',
        '[]',
        'commissioning',
        'active',
        0,
        0,
        accountState.systemVersion,
        accountState.systemWorkerName,
        null,
        'disconnected',
        0,
        'unverified',
        0,
        null,
        now,
        now,
      ],
    );
    partitionDatabase.run(
      `INSERT INTO accountFrontendCommandJournal (
        id, commandId, sourceGenerationId, accountId, accountName, actorId,
        actorName, frontendName, frontendVersion, journalKind, command, sourceCommand,
        mutations, appliedMutations, stagedCursor, stagedAt,
        originalContractVersion, originalPayload, lifecycle, pushProvenance,
        terminalOutcome, targetGenerationId, targetFrontendVersion,
        materializedReplicaIndex, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'afcj_corrupt',
        'cmd_corrupt',
        accountState.generationId,
        accountState.accountId,
        accountState.accountName,
        accountState.actorId,
        accountState.actorName,
        accountState.frontendName,
        accountFrontendSpec.version,
        'source',
        '{not-json',
        null,
        '[]',
        '[]',
        'stcur_corrupt',
        now,
        '1.0.0',
        '{}',
        'staged',
        null,
        null,
        null,
        null,
        null,
        now,
        now,
      ],
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
      authority: 'online',
      role: 'active',
      provider,
    });
    await expect(
      Effect.runPromise(decodeRpc(encodedAcquisition)),
    ).rejects.toThrow();
    const diagnostics = await Effect.runPromise(
      decodeRpc(await partitionApi.listAccountFrontendReplicas()),
    );

    expect(provider.getFrontendState).not.toHaveBeenCalled();
    expect(diagnostics).toMatchObject([
      {
        databaseName: 'afrp_corrupt/replica.db',
        status: 'commissioning',
        journalHealth: 'corrupt',
      },
    ]);
    expect(
      partitionDatabase.exec(
        'SELECT command FROM accountFrontendCommandJournal',
      )[0]?.values,
    ).toEqual([['{not-json']]);

    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('marks an interrupted service commission failed and rebuilds into a new preserved locator', async () => {
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-resume',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      ),
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    partitionDatabase.run(
      `INSERT INTO serviceFrontendReplicas (
        id, serviceName, actorId, actorName, frontendName, frontendVersion,
        frontendSpecHash, frontendSpec, databaseName, previousDatabaseNames,
        status, role, replicaIndex, frontendIndex, systemVersion,
        systemWorkerName, pendingTransition, socketState, reconnectAttempt,
        lastFailure, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'sfrp_interrupted',
        serviceState.serviceName,
        serviceState.actorId,
        serviceState.actorName,
        serviceState.frontendName,
        serviceFrontendSpec.version,
        serviceFrontendSpecHash,
        JSON.stringify(serviceFrontendSpec),
        'replica.db',
        '[]',
        'commissioning',
        'commissioned',
        0,
        0,
        serviceState.systemVersion,
        serviceState.systemWorkerName,
        null,
        'disconnected',
        0,
        null,
        now,
        now,
      ],
    );

    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'commissioned',
          provider,
        }),
      ),
    );
    const rows = partitionDatabase.exec(
      'SELECT id, status, previousDatabaseNames FROM serviceFrontendReplicas ORDER BY createdAt, id',
    )[0]?.values;
    const diagnostics = await Effect.runPromise(
      decodeRpc(await partitionApi.listServiceFrontendReplicas()),
    );

    expect(provider.getFrontendState).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(2);
    expect(rows?.find(row => row[0] === 'sfrp_interrupted')?.[1]).toBe(
      'failed',
    );
    expect(
      rows?.some(
        row =>
          row[1] === 'ready' &&
          String(row[2]).includes('sfrp_interrupted/replica.db'),
      ),
    ).toBe(true);
    expect(diagnostics.map(row => row.status).sort()).toEqual([
      'failed',
      'ready',
    ]);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('recovers a materialized account command whose partition receipt was interrupted without applying it twice', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-crash-recovery',
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
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_crash_recovery',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_crash',
      stagedCursor: 'stcur_crash',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_crash_recovery',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Recovered once' },
        }),
      },
    ]);

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    const target = {
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      frontendName: accountState.frontendName,
      frontendVersion: accountFrontendSpec.version,
    };
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target,
          baseReplicaIndex: 1,
          command,
          mutations,
        }),
      ),
    );
    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    partitionDatabase.run(
      'UPDATE accountFrontendCommandJournal SET appliedMutations = ?, materializedReplicaIndex = NULL WHERE commandId = ?',
      ['[]', command.id],
    );
    partitionDatabase.run(
      'UPDATE accountFrontendReplicas SET replicaIndex = 1',
    );

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
    await vi.advanceTimersByTimeAsync(0);

    migratePartitionDbAsync.mockImplementation(() =>
      Effect.sync(() => undefined),
    );
    migrateDbAsync.mockImplementation(() => Effect.sync(() => undefined));
    systemApis.clear();
    makeSharedWorkerHost();
    const restartedConnect = connectListeners.get('connect');
    if (restartedConnect === undefined) {
      throw new Error('restarted connect listener missing');
    }
    const restartedChannel = new MessageChannel();
    restartedConnect(
      new MessageEvent('connect', { ports: [restartedChannel.port1] }),
    );
    const restartedSystemApi = systemApis.get(0);
    if (restartedSystemApi === undefined) {
      throw new Error('restarted system api missing');
    }
    const restartedPartitionApi = await restartedSystemApi.getPartitionApi({
      partitionKey: 'partition_1',
    });
    const recoveredAcquisition = await Effect.runPromise(
      decodeRpc(
        await restartedPartitionApi.acquireFrontendReplica({
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
        }),
      ),
    );
    const state = await Effect.runPromise(
      decodeRpc(await recoveredAcquisition.getFrontendState()),
    );
    const receipt = partitionDatabase.exec(
      `SELECT materializedReplicaIndex, appliedMutations, stagedAt
       FROM accountFrontendCommandJournal WHERE commandId = '${command.id}'`,
    )[0]?.values[0];

    expect(state.replicaIndex).toBe(2);
    expect(state.stagedCommands.map(row => row.id)).toEqual([command.id]);
    expect(state.resources.map(row => row.id)).toEqual(['acct_crash_recovery']);
    expect(receipt?.[0]).toBe(2);
    expect(receipt?.[1]).not.toBe('[]');
    expect(receipt?.[2]).toBe(command.stagedAt.getTime());
    expect(
      partitionDatabase.exec(
        'SELECT replicaIndex FROM accountFrontendReplicas',
      )[0]?.values,
    ).toEqual([[2]]);
    expect(provider.getFrontendState).toHaveBeenCalledTimes(1);

    await Effect.runPromise(decodeRpc(await recoveredAcquisition.release()));
    restartedSystemApi[Symbol.dispose]();
    restartedChannel.port1.close();
    restartedChannel.port2.close();
  });

  it('recovers ordinary and adapted journal-only ownership across restart without rerunning local intent', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-journal-only-restart',
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
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_journal_only_restart',
      commandName: 'createList',
      payload: '{"name":"journal-only"}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_journal_only_restart',
      stagedCursor: 'stcur_journal_only_restart',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_journal_only_restart',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Recovered from journal only' },
        }),
      },
    ]);
    const commandBytes = Schema.encodeUnknownSync(
      Schema.parseJson(StagedCommandSchema),
    )(command);
    const mutationBytes = Schema.encodeUnknownSync(
      Schema.parseJson(Schema.Array(EncodedFrontendMutationSchema)),
    )(mutations);

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    partitionDatabase.run(
      `INSERT INTO accountFrontendCommandJournal (
        id, commandId, sourceGenerationId, accountId, accountName, actorId,
        actorName, frontendName, frontendVersion, journalKind, command, sourceCommand,
        mutations, appliedMutations, stagedCursor, stagedAt,
        originalContractVersion, originalPayload, lifecycle, pushProvenance,
        terminalOutcome, targetGenerationId, targetFrontendVersion,
        materializedReplicaIndex, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'afcj_journal_only_restart',
        command.id,
        accountState.generationId,
        accountState.accountId,
        accountState.accountName,
        accountState.actorId,
        accountState.actorName,
        accountState.frontendName,
        accountFrontendSpec.version,
        'source',
        commandBytes,
        null,
        mutationBytes,
        '[]',
        command.stagedCursor,
        command.stagedAt.getTime(),
        command.version,
        command.payload,
        'staged',
        null,
        null,
        null,
        null,
        null,
        now,
        now,
      ],
    );

    partitionDatabase.run(
      `INSERT INTO accountFrontendCommandJournal (
        id, commandId, sourceGenerationId, accountId, accountName, actorId,
        actorName, frontendName, frontendVersion, journalKind, command, sourceCommand,
        mutations, appliedMutations, stagedCursor, stagedAt,
        originalContractVersion, originalPayload, lifecycle, pushProvenance,
        terminalOutcome, targetGenerationId, targetFrontendVersion,
        materializedReplicaIndex, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'afcj_unrelated_target_restart',
        'cmd_unrelated_target_restart',
        accountState.generationId,
        'acct_unrelated_target_restart',
        accountState.accountName,
        'actr_unrelated_target_restart',
        accountState.actorName,
        accountState.frontendName,
        '0.9.0',
        'source',
        '{unrelated-corrupt-command',
        null,
        '{unrelated-corrupt-mutations',
        '[]',
        'stcur_unrelated_target_restart',
        command.stagedAt.getTime(),
        '0.9.0',
        '{}',
        'staged',
        null,
        null,
        accountState.generationId,
        accountFrontendSpec.version,
        null,
        now,
        now,
      ],
    );

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
    await vi.advanceTimersByTimeAsync(0);

    migratePartitionDbAsync.mockImplementation(() =>
      Effect.sync(() => undefined),
    );
    migrateDbAsync.mockImplementation(() => Effect.sync(() => undefined));
    systemApis.clear();
    makeSharedWorkerHost();
    const restartedConnect = connectListeners.get('connect');
    if (restartedConnect === undefined) {
      throw new Error('restarted connect listener missing');
    }
    const restartedChannel = new MessageChannel();
    restartedConnect(
      new MessageEvent('connect', { ports: [restartedChannel.port1] }),
    );
    const restartedSystemApi = systemApis.get(0);
    if (restartedSystemApi === undefined) {
      throw new Error('restarted system api missing');
    }
    const restartedPartitionApi = await restartedSystemApi.getPartitionApi({
      partitionKey: 'partition_1',
    });
    const recoveredAcquisition = await Effect.runPromise(
      decodeRpc(
        await restartedPartitionApi.acquireFrontendReplica({
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
        }),
      ),
    );
    const recoveredState = await Effect.runPromise(
      decodeRpc(await recoveredAcquisition.getFrontendState()),
    );
    const secondAcquisition = await Effect.runPromise(
      decodeRpc(
        await restartedPartitionApi.acquireFrontendReplica({
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
        }),
      ),
    );
    const secondState = await Effect.runPromise(
      decodeRpc(await secondAcquisition.getFrontendState()),
    );
    const journalRow = partitionDatabase.exec(
      `SELECT command, materializedReplicaIndex, appliedMutations
       FROM accountFrontendCommandJournal WHERE commandId = ?`,
      [command.id],
    )[0]?.values[0];

    expect(recoveredState.replicaIndex).toBe(2);
    expect(recoveredState.stagedCommands).toEqual([command]);
    expect(recoveredState.resources.map(resource => resource.id)).toEqual([
      'acct_journal_only_restart',
    ]);
    expect(secondState.replicaIndex).toBe(2);
    expect(secondState.stagedCommands).toEqual([command]);
    expect(journalRow?.[0]).toBe(commandBytes);
    expect(journalRow?.[1]).toBe(2);
    expect(journalRow?.[2]).not.toBe('[]');
    expect(
      partitionDatabase.exec(
        `SELECT command FROM accountFrontendCommandJournal
         WHERE commandId = 'cmd_unrelated_target_restart'`,
      )[0]?.values,
    ).toEqual([['{unrelated-corrupt-command']]);
    expect(provider.getFrontendState).toHaveBeenCalledTimes(1);

    const sourceCommand = Schema.validateSync(StagedCommandSchema)({
      ...command,
      id: 'cmd_adapted_journal_restart',
      payload: '{"name":"source"}',
      systemVersion: '0.9.0',
      version: '0.9.0',
      sessionId: 'sesn_adapted_journal_restart',
      stagedCursor: 'stcur_adapted_journal_restart',
    });
    const adaptedCommand = Schema.validateSync(StagedCommandSchema)({
      ...sourceCommand,
      payload: '{"name":"adapted"}',
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
    });
    const adaptedMutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: adaptedCommand.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_adapted_journal_restart',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Recovered adapted intent' },
        }),
      },
    ]);
    const adaptedCommandBytes = Schema.encodeUnknownSync(
      Schema.parseJson(StagedCommandSchema),
    )(adaptedCommand);
    partitionDatabase.run(
      `INSERT INTO accountFrontendCommandJournal (
        id, commandId, sourceGenerationId, accountId, accountName, actorId,
        actorName, frontendName, frontendVersion, journalKind, command, sourceCommand,
        mutations, appliedMutations, stagedCursor, stagedAt,
        originalContractVersion, originalPayload, lifecycle, pushProvenance,
        terminalOutcome, targetGenerationId, targetFrontendVersion,
        materializedReplicaIndex, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'afcj_adapted_journal_restart',
        adaptedCommand.id,
        accountState.generationId,
        sourceCommand.accountId,
        sourceCommand.accountName,
        sourceCommand.actorId,
        sourceCommand.actorName,
        sourceCommand.frontendName,
        sourceCommand.version,
        'adapted',
        adaptedCommandBytes,
        Schema.encodeUnknownSync(Schema.parseJson(StagedCommandSchema))(
          sourceCommand,
        ),
        Schema.encodeUnknownSync(
          Schema.parseJson(Schema.Array(EncodedFrontendMutationSchema)),
        )(adaptedMutations),
        '[]',
        adaptedCommand.stagedCursor,
        adaptedCommand.stagedAt.getTime(),
        sourceCommand.version,
        sourceCommand.payload,
        'staged',
        null,
        null,
        accountState.generationId,
        accountFrontendSpec.version,
        null,
        now,
        now,
      ],
    );

    await Effect.runPromise(decodeRpc(await recoveredAcquisition.release()));
    await Effect.runPromise(decodeRpc(await secondAcquisition.release()));
    restartedSystemApi[Symbol.dispose]();
    restartedChannel.port1.close();
    restartedChannel.port2.close();
    await vi.advanceTimersByTimeAsync(0);

    systemApis.clear();
    makeSharedWorkerHost();
    const adaptedRestartConnect = connectListeners.get('connect');
    if (adaptedRestartConnect === undefined) {
      throw new Error('adapted restart connect listener missing');
    }
    const adaptedRestartChannel = new MessageChannel();
    adaptedRestartConnect(
      new MessageEvent('connect', { ports: [adaptedRestartChannel.port1] }),
    );
    const adaptedRestartSystemApi = systemApis.get(0);
    if (adaptedRestartSystemApi === undefined) {
      throw new Error('adapted restart system api missing');
    }
    const adaptedRestartPartitionApi =
      await adaptedRestartSystemApi.getPartitionApi({
        partitionKey: 'partition_1',
      });
    const adaptedRecoveryAcquisition = await Effect.runPromise(
      decodeRpc(
        await adaptedRestartPartitionApi.acquireFrontendReplica({
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
        }),
      ),
    );
    const adaptedRecoveryState = await Effect.runPromise(
      decodeRpc(await adaptedRecoveryAcquisition.getFrontendState()),
    );
    const adaptedJournalRow = partitionDatabase.exec(
      `SELECT frontendVersion, targetGenerationId, targetFrontendVersion,
              command, materializedReplicaIndex, appliedMutations
       FROM accountFrontendCommandJournal WHERE commandId = ?`,
      [adaptedCommand.id],
    )[0]?.values[0];

    expect(adaptedRecoveryState.replicaIndex).toBe(3);
    expect(
      adaptedRecoveryState.stagedCommands.map(staged => staged.id),
    ).toEqual([command.id, adaptedCommand.id]);
    expect(
      adaptedRecoveryState.resources.map(resource => resource.id).sort(),
    ).toEqual(['acct_adapted_journal_restart', 'acct_journal_only_restart']);
    expect(adaptedJournalRow).toEqual([
      sourceCommand.version,
      accountState.generationId,
      accountFrontendSpec.version,
      adaptedCommandBytes,
      3,
      adaptedJournalRow?.[5],
    ]);
    expect(adaptedJournalRow?.[5]).not.toBe('[]');
    expect(provider.getFrontendState).toHaveBeenCalledTimes(1);

    await Effect.runPromise(
      decodeRpc(await adaptedRecoveryAcquisition.release()),
    );
    adaptedRestartSystemApi[Symbol.dispose]();
    adaptedRestartChannel.port1.close();
    adaptedRestartChannel.port2.close();
  });

  it('rejects unproven account and service transition controls before persistence', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const accountProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-account-unproven-transition',
          systemId: accountState.systemId,
          generationId: 'gen_3',
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
    } satisfies AccountFrontendReplicaProviderApi;
    const serviceProvider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-unproven-transition',
          systemId: serviceState.systemId,
          generationId: 'gen_2',
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      ),
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const accountAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: accountProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await accountAcquisition.getFrontendState()),
    );
    const serviceAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: serviceProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await serviceAcquisition.getFrontendState()),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(2));
    const accountSocket = webSocketInstances.find(socket =>
      socket.url.includes('ticket-account-unproven-transition'),
    );
    if (accountSocket === undefined) {
      throw new Error('account transition socket missing');
    }
    const serviceSocket = webSocketInstances.find(socket =>
      socket.url.includes('ticket-service-unproven-transition'),
    );
    if (serviceSocket === undefined) {
      throw new Error('service transition socket missing');
    }
    accountSocket.dispatchEvent(new Event('open'));
    serviceSocket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);

    accountSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'frontendBlock',
          sync: {
            kind: 'generation-boundary',
            systemId: accountState.systemId,
            prevGenerationId: accountState.generationId,
            generationId: 'gen_2',
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendIndex: 1,
          },
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(accountProvider.handleFrontendReplicaBlock).toHaveBeenCalledTimes(
        1,
      ),
    );
    accountSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'lineage-transition-required',
          kind: 'lineage-transition-required',
          systemId: accountState.systemId,
          generationId: 'gen_3',
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          appliedBoundaryIndex: 1,
          remainingBoundaries: [
            {
              kind: 'generation-boundary',
              systemId: accountState.systemId,
              prevGenerationId: 'gen_unrelated',
              generationId: 'gen_3',
              accountId: accountState.accountId,
              accountName: accountState.accountName,
              actorId: accountState.actorId,
              actorName: accountState.actorName,
              frontendName: accountState.frontendName,
              frontendIndex: 1,
            },
          ],
        }),
      }),
    );
    serviceSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'lineage-transition-required',
          kind: 'lineage-transition-required',
          systemId: serviceState.systemId,
          generationId: 'gen_2',
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          appliedBoundaryIndex: 0,
          remainingBoundaries: [],
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(accountProvider.replaceFrontendState).toHaveBeenCalledTimes(1),
    );
    await vi.waitFor(() =>
      expect(serviceProvider.replaceFrontendState).toHaveBeenCalledTimes(1),
    );

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    expect(
      partitionDatabase.exec(
        'SELECT pendingTransition FROM accountFrontendReplicas',
      )[0]?.values[0],
    ).toEqual([null]);
    expect(
      partitionDatabase.exec(
        'SELECT pendingTransition FROM serviceFrontendReplicas',
      )[0]?.values[0],
    ).toEqual([null]);
    await expect(
      Effect.runPromise(
        decodeRpc(
          await partitionApi.markFrontendCommandsMigrated({
            sourceTarget: {
              accountId: accountState.accountId,
              accountName: accountState.accountName,
              actorId: accountState.actorId,
              actorName: accountState.actorName,
              frontendName: accountState.frontendName,
              frontendVersion: accountFrontendSpec.version,
            },
            target: {
              generationId: 'gen_3',
              accountId: accountState.accountId,
              accountName: accountState.accountName,
              actorId: accountState.actorId,
              actorName: accountState.actorName,
              frontendName: accountState.frontendName,
              frontendVersion: accountFrontendSpec.version,
            },
            commandIds: [],
          }),
        ),
      ),
    ).rejects.toThrow('frontend-journal-migration-lineage-pending');

    await Effect.runPromise(decodeRpc(await accountAcquisition.release()));
    await Effect.runPromise(decodeRpc(await serviceAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('quarantines injected account and service transitions that have no applied boundary proof', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const accountTicket = vi.fn(async () =>
      encodeRight({
        ticket: 'ticket-account-transition-restart',
        systemId: accountState.systemId,
        generationId: accountState.generationId,
        accountId: accountState.accountId,
        accountName: accountState.accountName,
        actorId: accountState.actorId,
        actorName: accountState.actorName,
        frontendName: accountState.frontendName,
        frontendVersion: accountFrontendSpec.version,
      }),
    );
    const accountProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: accountTicket,
      pushCommands: vi.fn(async () =>
        encodeRight({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
      ),
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;
    const serviceTicket = vi.fn(async () =>
      encodeRight({
        ticket: 'ticket-service-transition-restart',
        systemId: serviceState.systemId,
        generationId: serviceState.generationId,
        serviceName: serviceState.serviceName,
        actorId: serviceState.actorId,
        actorName: serviceState.actorName,
        frontendName: serviceState.frontendName,
        frontendVersion: serviceFrontendSpec.version,
      }),
    );
    const serviceProvider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: serviceTicket,
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const accountAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: accountProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await accountAcquisition.getFrontendState()),
    );
    const serviceAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: serviceProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await serviceAcquisition.getFrontendState()),
    );

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    partitionDatabase.run(
      'UPDATE accountFrontendReplicas SET pendingTransition = ?, socketState = ?',
      [
        JSON.stringify({
          kind: 'lineage-transition-required',
          systemId: accountState.systemId,
          generationId: 'gen_2',
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          appliedBoundaryIndex: accountState.frontendIndex,
          remainingBoundaries: [],
        }),
        'disconnected',
      ],
    );
    partitionDatabase.run(
      'UPDATE serviceFrontendReplicas SET pendingTransition = ?, socketState = ?',
      [
        JSON.stringify({
          kind: 'lineage-transition-required',
          systemId: serviceState.systemId,
          generationId: 'gen_2',
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          appliedBoundaryIndex: serviceState.frontendIndex,
          remainingBoundaries: [],
        }),
        'disconnected',
      ],
    );

    await Effect.runPromise(decodeRpc(await accountAcquisition.release()));
    await Effect.runPromise(decodeRpc(await serviceAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
    await vi.advanceTimersByTimeAsync(0);

    migratePartitionDbAsync.mockImplementation(() =>
      Effect.sync(() => undefined),
    );
    migrateDbAsync.mockImplementation(() => Effect.sync(() => undefined));
    systemApis.clear();
    webSocketInstances.length = 0;
    accountTicket.mockClear();
    serviceTicket.mockClear();
    makeSharedWorkerHost();
    const restartedConnect = connectListeners.get('connect');
    if (restartedConnect === undefined) {
      throw new Error('restarted connect listener missing');
    }
    const restartedChannel = new MessageChannel();
    restartedConnect(
      new MessageEvent('connect', { ports: [restartedChannel.port1] }),
    );
    const restartedSystemApi = systemApis.get(0);
    if (restartedSystemApi === undefined) {
      throw new Error('restarted system api missing');
    }
    const restartedPartitionApi = await restartedSystemApi.getPartitionApi({
      partitionKey: 'partition_1',
    });
    await expect(
      Effect.runPromise(
        decodeRpc(
          await restartedPartitionApi.acquireFrontendReplica({
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendVersion: accountFrontendSpec.version,
            frontendSpec: accountFrontendSpec,
            frontendSpecHash: accountFrontendSpecHash,
            authority: 'online',
            role: 'active',
            provider: accountProvider,
          }),
        ),
      ),
    ).rejects.toThrow('account-frontend-persisted-transition-unproven');
    await expect(
      Effect.runPromise(
        decodeRpc(
          await restartedPartitionApi.acquireServiceFrontendReplica({
            serviceName: serviceState.serviceName,
            actorId: serviceState.actorId,
            actorName: serviceState.actorName,
            frontendName: serviceState.frontendName,
            frontendVersion: serviceFrontendSpec.version,
            frontendSpec: serviceFrontendSpec,
            frontendSpecHash: serviceFrontendSpecHash,
            authority: 'online',
            role: 'active',
            provider: serviceProvider,
          }),
        ),
      ),
    ).rejects.toThrow('service-frontend-persisted-transition-unproven');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(accountProvider.getFrontendState).toHaveBeenCalledTimes(1);
    expect(serviceProvider.getFrontendState).toHaveBeenCalledTimes(1);
    expect(accountTicket).not.toHaveBeenCalled();
    expect(serviceTicket).not.toHaveBeenCalled();
    expect(webSocketInstances).toHaveLength(0);
    expect(
      partitionDatabase.exec(
        `SELECT pendingTransition, status, lastFailure, socketState
         FROM accountFrontendReplicas`,
      )[0]?.values[0],
    ).toEqual([
      expect.any(String),
      'failed',
      expect.stringContaining('account-frontend-persisted-transition-unproven'),
      'disconnected',
    ]);
    expect(
      partitionDatabase.exec(
        `SELECT pendingTransition, status, lastFailure, socketState
         FROM serviceFrontendReplicas`,
      )[0]?.values[0],
    ).toEqual([
      expect.any(String),
      'failed',
      expect.stringContaining('service-frontend-persisted-transition-unproven'),
      'disconnected',
    ]);

    partitionDatabase.run(
      'UPDATE serviceFrontendReplicas SET pendingTransition = ?',
      [JSON.stringify({ kind: 'lineage-transition-required' })],
    );
    await expect(
      Effect.runPromise(
        decodeRpc(await restartedPartitionApi.listServiceFrontendReplicas()),
      ),
    ).rejects.toThrow('list-service-frontend-replicas-failed');

    restartedSystemApi[Symbol.dispose]();
    restartedChannel.port1.close();
    restartedChannel.port2.close();
  });

  it('retries a post-materialization receipt failure and fans one committed replacement to an existing sibling', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const existingReplacement = vi.fn(async () => encodeRight(undefined));
    const existingProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-recovery-existing-sibling',
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
      replaceFrontendState: existingReplacement,
    } satisfies AccountFrontendReplicaProviderApi;
    const acquiringProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-recovery-acquiring-sibling',
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
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_retry_recovery_receipt',
      commandName: 'createList',
      payload: '{"name":"retry"}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_retry_recovery_receipt',
      stagedCursor: 'stcur_retry_recovery_receipt',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_retry_recovery_receipt',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Receipt retry' },
        }),
      },
    ]);

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
    const existingAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: existingProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await existingAcquisition.getFrontendState()),
    );
    await vi.advanceTimersByTimeAsync(0);

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    partitionDatabase.run(
      `INSERT INTO accountFrontendCommandJournal (
        id, commandId, sourceGenerationId, accountId, accountName, actorId,
        actorName, frontendName, frontendVersion, journalKind, command, sourceCommand,
        mutations, appliedMutations, stagedCursor, stagedAt,
        originalContractVersion, originalPayload, lifecycle, pushProvenance,
        terminalOutcome, targetGenerationId, targetFrontendVersion,
        materializedReplicaIndex, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'afcj_retry_recovery_receipt',
        command.id,
        accountState.generationId,
        accountState.accountId,
        accountState.accountName,
        accountState.actorId,
        accountState.actorName,
        accountState.frontendName,
        accountFrontendSpec.version,
        'source',
        Schema.encodeUnknownSync(Schema.parseJson(StagedCommandSchema))(
          command,
        ),
        null,
        Schema.encodeUnknownSync(
          Schema.parseJson(Schema.Array(EncodedFrontendMutationSchema)),
        )(mutations),
        '[]',
        command.stagedCursor,
        command.stagedAt.getTime(),
        command.version,
        command.payload,
        'staged',
        null,
        null,
        null,
        null,
        null,
        now,
        now,
      ],
    );

    let failReceiptCommit = true;
    makeTxAsync.mockImplementation(props => {
      if (
        failReceiptCommit &&
        Reflect.get(props.db, '$client') === partitionDatabase
      ) {
        failReceiptCommit = false;
        return Effect.fail(new Error('injected partition receipt failure'));
      }
      return props.program({ tx: props.db });
    });

    await expect(
      Effect.runPromise(
        decodeRpc(
          await partitionApi.acquireFrontendReplica({
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
            provider: acquiringProvider,
          }),
        ),
      ),
    ).rejects.toThrow('account-frontend-journal-recovery-failed');

    const interruptedJournal = partitionDatabase.exec(
      `SELECT materializedReplicaIndex, appliedMutations
       FROM accountFrontendCommandJournal WHERE commandId = ?`,
      [command.id],
    )[0]?.values[0];
    const interruptedCatalog = partitionDatabase.exec(
      'SELECT replicaIndex, journalHealth, lastFailure FROM accountFrontendReplicas',
    )[0]?.values[0];
    expect(interruptedJournal).toEqual([null, '[]']);
    expect(interruptedCatalog?.[0]).toBe(1);
    expect(interruptedCatalog?.[1]).toBe('healthy');
    expect(interruptedCatalog?.[2]).not.toBeNull();
    expect(existingReplacement).not.toHaveBeenCalled();

    const recoveredAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
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
          provider: acquiringProvider,
        }),
      ),
    );
    const recoveredState = await Effect.runPromise(
      decodeRpc(await recoveredAcquisition.getFrontendState()),
    );
    const repeatedAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
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
          provider: acquiringProvider,
        }),
      ),
    );
    const repeatedState = await Effect.runPromise(
      decodeRpc(await repeatedAcquisition.getFrontendState()),
    );

    expect(recoveredState.replicaIndex).toBe(2);
    expect(recoveredState.stagedCommands).toEqual([command]);
    expect(recoveredState.resources.map(resource => resource.id)).toEqual([
      'acct_retry_recovery_receipt',
    ]);
    expect(repeatedState.replicaIndex).toBe(2);
    expect(existingReplacement).toHaveBeenCalledTimes(1);
    expect(existingReplacement.mock.calls[0]?.[0]).toMatchObject({
      replicaIndex: 2,
      stagedCommands: [{ id: command.id }],
    });
    expect(
      partitionDatabase.exec(
        `SELECT materializedReplicaIndex, appliedMutations
         FROM accountFrontendCommandJournal WHERE commandId = ?`,
        [command.id],
      )[0]?.values[0]?.[0],
    ).toBe(2);

    await Effect.runPromise(decodeRpc(await recoveredAcquisition.release()));
    await Effect.runPromise(decodeRpc(await repeatedAcquisition.release()));
    await Effect.runPromise(decodeRpc(await existingAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('hands the same command bytes to the next provider after an uncertain push and commits one result', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const firstPush = vi.fn(
      async (
        _commands: Parameters<
          AccountFrontendReplicaProviderApi['pushCommands']
        >[0],
      ) => {
        throw new Error('first push response lost');
      },
    );
    const secondPush = vi.fn(
      async (
        commands: Parameters<
          AccountFrontendReplicaProviderApi['pushCommands']
        >[0],
      ) => {
        const command = commands[0];
        if (command === undefined) throw new Error('command missing');
        return encodeRight({
          pendingCommands: [
            {
              ...command,
              pushedAt: new Date('2026-01-01T00:00:01.000Z'),
              pushedCursor: 'pcur_handoff',
              status: 'pushed',
            },
          ],
          pushedCommands: [],
          failedCommands: [],
        });
      },
    );
    const firstProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-push-first',
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
      pushCommands: firstPush,
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;
    const secondProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-push-second',
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
      pushCommands: secondPush,
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_push_handoff',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_push',
      stagedCursor: 'stcur_push',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_push_handoff',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Push handoff' },
        }),
      },
    ]);

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
    const secondChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [secondChannel.port1] }));
    const secondSystemApi = systemApis.get(1);
    if (secondSystemApi === undefined) {
      throw new Error('second system api missing');
    }
    const secondPartitionApi = await secondSystemApi.getPartitionApi({
      partitionKey: 'partition_1',
    });
    const firstAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: firstProvider,
        }),
      ),
    );
    const secondAcquisition = await Effect.runPromise(
      decodeRpc(
        await secondPartitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: secondProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await firstAcquisition.getFrontendState()),
    );
    await Effect.runPromise(
      decodeRpc(await secondAcquisition.getFrontendState()),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    webSocketInstances[0]?.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    webSocketInstances[0]?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: accountState.generationId,
          frontendIndex: 0,
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target: {
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendVersion: accountFrontendSpec.version,
          },
          baseReplicaIndex: 1,
          command,
          mutations,
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(secondPush).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(secondProvider.handleFrontendReplicaBlock).toHaveBeenCalledTimes(
        2,
      ),
    );

    expect(firstPush).toHaveBeenCalledTimes(1);
    expect(firstProvider.handleFrontendReplicaBlock).toHaveBeenCalledTimes(1);
    expect(firstPush.mock.calls[0]?.[0]).toEqual(secondPush.mock.calls[0]?.[0]);
    const state = await Effect.runPromise(
      decodeRpc(await secondAcquisition.getFrontendState()),
    );
    expect(state.replicaIndex).toBe(3);
    expect(state.stagedCommands).toEqual([]);
    expect(state.pushedCommands.map(row => row.id)).toEqual([command.id]);

    await Effect.runPromise(decodeRpc(await firstAcquisition.release()));
    await Effect.runPromise(decodeRpc(await secondAcquisition.release()));
    systemApi[Symbol.dispose]();
    secondSystemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
    secondChannel.port1.close();
    secondChannel.port2.close();
  });

  it('suspends writes and makes the rejected batch dormant without transitioning or closing the live socket', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const pushFailure = new ZerospinError({
      code: 'generation-write-admission-closed',
      message: 'The source generation no longer accepts writes',
    });
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-write-suspended',
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
      pushCommands: vi.fn(async () => encodeLeft(pushFailure)),
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_write_suspended',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_write_suspended',
      stagedCursor: 'stcur_write_suspended',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const secondCommand = Schema.validateSync(StagedCommandSchema)({
      ...command,
      id: 'cmd_write_suspended_second',
      stagedCursor: 'stcur_write_suspended_second',
    });

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    const socket = webSocketInstances[0];
    if (socket === undefined) throw new Error('account socket missing');
    socket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: accountState.generationId,
          frontendIndex: 0,
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target: {
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendVersion: accountFrontendSpec.version,
          },
          baseReplicaIndex: 1,
          command,
          mutations: [],
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(provider.pushCommands).toHaveBeenCalledOnce(),
    );

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    expect(
      partitionDatabase.exec(
        'SELECT lifecycle, journalKind FROM accountFrontendCommandJournal WHERE commandId = ?',
        [command.id],
      )[0]?.values,
    ).toEqual([['dormant', 'source']]);
    expect(
      partitionDatabase.exec(
        'SELECT writeSuspended, socketState, pendingTransition FROM accountFrontendReplicas',
      )[0]?.values,
    ).toEqual([[1, 'online', null]]);
    expect(socket.close).not.toHaveBeenCalled();
    await expect(
      Effect.runPromise(
        decodeRpc(
          await partitionApi.stageFrontendCommand({
            target: {
              accountId: accountState.accountId,
              accountName: accountState.accountName,
              actorId: accountState.actorId,
              actorName: accountState.actorName,
              frontendName: accountState.frontendName,
              frontendVersion: accountFrontendSpec.version,
            },
            baseReplicaIndex: 2,
            command: secondCommand,
            mutations: [],
          }),
        ),
      ),
    ).rejects.toThrow('account-frontend-stage-write-suspended');
    expect(
      await Effect.runPromise(
        decodeRpc(
          await partitionApi.getDormantFrontendCommands({
            sourceTarget: {
              generationId: accountState.generationId,
              accountId: accountState.accountId,
              accountName: accountState.accountName,
              actorId: accountState.actorId,
              actorName: accountState.actorName,
              frontendName: accountState.frontendName,
              frontendVersion: accountFrontendSpec.version,
            },
            targetFrontendVersion: '2.0.0',
          }),
        ),
      ),
    ).toHaveLength(1);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('keeps an account socket readable while same-generation frontend-version authority suspends writes and preserves dormant intent', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-account-same-generation-new-version',
          systemId: accountState.systemId,
          generationId: accountState.generationId,
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: '2.0.0',
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
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_same_generation_new_version',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_same_generation_new_version',
      stagedCursor: 'stcur_same_generation_new_version',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const rejectedCommand = Schema.validateSync(StagedCommandSchema)({
      ...command,
      id: 'cmd_same_generation_new_version_rejected',
      stagedCursor: 'stcur_same_generation_new_version_rejected',
    });

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target: {
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendVersion: accountFrontendSpec.version,
          },
          baseReplicaIndex: 1,
          command,
          mutations: [],
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    const socket = webSocketInstances[0];
    if (socket === undefined) throw new Error('account socket missing');
    expect(socket.url).toContain(
      'ticket=ticket-account-same-generation-new-version',
    );
    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    expect(
      partitionDatabase.exec(
        'SELECT lifecycle, journalKind FROM accountFrontendCommandJournal WHERE commandId = ?',
        [command.id],
      )[0]?.values,
    ).toEqual([['dormant', 'source']]);
    expect(
      partitionDatabase.exec(
        'SELECT writeSuspended, socketState, lastFailure FROM accountFrontendReplicas',
      )[0]?.values,
    ).toEqual([
      [1, 'connecting', expect.stringContaining('frontend-version-changed')],
    ]);

    socket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        replicaGenerationId: accountState.generationId,
        frontendIndex: 0,
      }),
    );
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: accountState.generationId,
          frontendIndex: 0,
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'frontendBlock',
          sync: {
            kind: 'frontend',
            systemId: accountState.systemId,
            generationId: accountState.generationId,
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendBlock: {
              frontendName: accountState.frontendName,
              lastAccountCursor: 'acur_same_generation_new_version',
              frontendIndex: 1,
              lastRebasedPushedCursor: null,
              delta: { inserted: [], updated: [], deleted: [] },
              pendingPushedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          },
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(provider.handleFrontendReplicaBlock).toHaveBeenCalledTimes(2),
    );
    expect(
      await Effect.runPromise(
        decodeRpc(await partitionApi.listAccountFrontendReplicas()),
      ),
    ).toMatchObject([
      {
        socketState: 'online',
        frontendIndex: 1,
        lastFailure: { code: 'frontend-version-changed' },
      },
    ]);
    expect(provider.pushCommands).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
    await expect(
      Effect.runPromise(
        decodeRpc(
          await partitionApi.stageFrontendCommand({
            target: {
              accountId: accountState.accountId,
              accountName: accountState.accountName,
              actorId: accountState.actorId,
              actorName: accountState.actorName,
              frontendName: accountState.frontendName,
              frontendVersion: accountFrontendSpec.version,
            },
            baseReplicaIndex: 2,
            command: rejectedCommand,
            mutations: [],
          }),
        ),
      ),
    ).rejects.toThrow('account-frontend-stage-write-suspended');

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('keeps a service socket readable while same-generation frontend-version authority remains visible', async () => {
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-same-generation-new-version',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: '2.0.0',
        }),
      ),
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    const socket = webSocketInstances[0];
    if (socket === undefined) throw new Error('service socket missing');
    expect(socket.url).toContain(
      'ticket=ticket-service-same-generation-new-version',
    );
    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    expect(
      partitionDatabase.exec(
        'SELECT socketState, lastFailure FROM serviceFrontendReplicas',
      )[0]?.values,
    ).toEqual([
      ['connecting', expect.stringContaining('frontend-version-changed')],
    ]);

    socket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        replicaGenerationId: serviceState.generationId,
        frontendIndex: 0,
      }),
    );
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: serviceState.generationId,
          frontendIndex: 0,
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'serviceFrontendBlock',
          sync: {
            kind: 'service-frontend',
            systemId: serviceState.systemId,
            generationId: serviceState.generationId,
            serviceName: serviceState.serviceName,
            actorId: serviceState.actorId,
            actorName: serviceState.actorName,
            frontendName: serviceState.frontendName,
            frontendBlock: {
              serviceName: serviceState.serviceName,
              actorId: serviceState.actorId,
              actorName: serviceState.actorName,
              frontendName: serviceState.frontendName,
              frontendIndex: 1,
              lastServiceCursor: 'svcur_same_generation_new_version',
              delta: { inserted: [], updated: [], deleted: [] },
            },
          },
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(provider.handleServiceFrontendReplicaBlock).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(
      await Effect.runPromise(
        decodeRpc(await partitionApi.listServiceFrontendReplicas()),
      ),
    ).toMatchObject([
      {
        socketState: 'online',
        frontendIndex: 1,
        lastFailure: { code: 'frontend-version-changed' },
      },
    ]);
    expect(provider.replaceFrontendState).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('preserves an eligible locally pushed overlay during an ordinary authoritative replacement', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-pushed-overlay-repair',
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
      pushCommands: vi.fn(
        async (
          commands: Parameters<
            AccountFrontendReplicaProviderApi['pushCommands']
          >[0],
        ) => {
          const command = commands[0];
          if (command === undefined) throw new Error('command missing');
          return encodeRight({
            pendingCommands: [
              {
                ...command,
                pushedAt: new Date('2026-01-01T00:00:01.000Z'),
                pushedCursor: 'pcur_pushed_overlay_repair',
                status: 'pushed',
              },
            ],
            pushedCommands: [],
            failedCommands: [],
          });
        },
      ),
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_pushed_overlay_repair',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_pushed_overlay_repair',
      stagedCursor: 'stcur_pushed_overlay_repair',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_pushed_overlay_repair',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Preserved pushed overlay' },
        }),
      },
    ]);

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    const socket = webSocketInstances[0];
    if (socket === undefined) throw new Error('account socket missing');
    socket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: accountState.generationId,
          frontendIndex: 0,
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target: {
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendVersion: accountFrontendSpec.version,
          },
          baseReplicaIndex: 1,
          command,
          mutations,
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(provider.pushCommands).toHaveBeenCalledOnce(),
    );

    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'state-required',
          systemId: accountState.systemId,
          generationId: accountState.generationId,
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendIndex: 0,
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(provider.getFrontendState).toHaveBeenCalledTimes(2),
    );
    const repairedState = await Effect.runPromise(
      decodeRpc(await acquisition.getFrontendState()),
    );

    expect(repairedState.pushedCommands.map(row => row.id)).toEqual([
      command.id,
    ]);
    expect(repairedState.stagedCommands).toEqual([]);
    expect(repairedState.resources.map(row => row.id)).toEqual([
      'acct_pushed_overlay_repair',
    ]);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('keeps transport-uncertain intent out of dormant migration until authoritative absence settles it', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    let releaseRepair = () => {
      // Assigned synchronously by the Promise constructor below.
    };
    const repairGate = new Promise<void>(resolve => {
      releaseRepair = () => resolve();
    });
    let initialStateReturned = false;
    const provider = {
      getFrontendState: vi.fn(async () => {
        if (!initialStateReturned) {
          initialStateReturned = true;
          return encodeRight(accountState);
        }
        await repairGate;
        return encodeRight(accountState);
      }),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-transport-uncertain-repair',
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
        encodeLeft(
          new ZerospinError({
            code: 'temporary-account-push-failure',
            message: 'Push outcome is unavailable',
          }),
        ),
      ),
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_transport_uncertain_repair',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_transport_uncertain_repair',
      stagedCursor: 'stcur_transport_uncertain_repair',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const sourceTarget = {
      generationId: accountState.generationId,
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      frontendName: accountState.frontendName,
      frontendVersion: accountFrontendSpec.version,
    };

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    const socket = webSocketInstances[0];
    if (socket === undefined) throw new Error('account socket missing');
    socket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: accountState.generationId,
          frontendIndex: 0,
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target: sourceTarget,
          baseReplicaIndex: 1,
          command,
          mutations: [],
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(provider.getFrontendState).toHaveBeenCalledTimes(2),
    );
    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    expect(
      partitionDatabase.exec(
        'SELECT lifecycle FROM accountFrontendCommandJournal WHERE commandId = ?',
        [command.id],
      )[0]?.values,
    ).toEqual([['transport-uncertain']]);
    expect(
      await Effect.runPromise(
        decodeRpc(
          await partitionApi.getDormantFrontendCommands({
            sourceTarget,
            targetFrontendVersion: '2.0.0',
          }),
        ),
      ),
    ).toEqual([]);

    releaseRepair();
    await vi.waitFor(() =>
      expect(
        partitionDatabase.exec(
          'SELECT lifecycle FROM accountFrontendCommandJournal WHERE commandId = ?',
          [command.id],
        )[0]?.values,
      ).toEqual([['dormant']]),
    );
    expect(
      await Effect.runPromise(
        decodeRpc(
          await partitionApi.getDormantFrontendCommands({
            sourceTarget,
            targetFrontendVersion: '2.0.0',
          }),
        ),
      ),
    ).toHaveLength(1);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('rebuilds a corrupt online service materialization under a new database name before replacement fanout', async () => {
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const firstReplacement = vi.fn(async () => encodeRight(undefined));
    const firstProvider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-corruption-first',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      ),
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: firstReplacement,
    } satisfies ServiceFrontendReplicaProviderApi;
    const replacementState = Schema.decodeUnknownSync(
      ServiceFrontendStateSchema,
    )({
      ...serviceState,
      systemVersion: '1.0.1',
    });
    const secondProvider = {
      getFrontendState: vi.fn(async () => encodeRight(replacementState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-corruption-second',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      ),
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const firstAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: firstProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await firstAcquisition.getFrontendState()),
    );
    await vi.advanceTimersByTimeAsync(0);

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    const originalCatalog = partitionDatabase.exec(
      "SELECT id, databaseName, replicaIndex FROM serviceFrontendReplicas WHERE status = 'ready'",
    )[0]?.values[0];
    if (originalCatalog === undefined) {
      throw new Error('ready service catalog row missing');
    }
    const replicaId = String(originalCatalog[0]);
    const originalDatabaseName = String(originalCatalog[1]);
    const originalDatabaseKey = `zerospin/sys_1/gen_1/partitions/partition_1/service/${replicaId}/${originalDatabaseName}`;
    const originalDatabase = databaseClients.get(originalDatabaseKey);
    if (originalDatabase === undefined) {
      throw new Error('original service database missing');
    }
    originalDatabase.run(
      "UPDATE serviceReplicaState SET state = '{not-json' WHERE id = 'srps_current'",
    );

    const secondAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: secondProvider,
        }),
      ),
    );
    const rebuiltState = await Effect.runPromise(
      decodeRpc(await secondAcquisition.getFrontendState()),
    );
    const rebuiltCatalog = partitionDatabase.exec(
      'SELECT databaseName, previousDatabaseNames, replicaIndex, systemVersion FROM serviceFrontendReplicas WHERE id = ?',
      [replicaId],
    )[0]?.values[0];
    if (rebuiltCatalog === undefined) {
      throw new Error('rebuilt service catalog row missing');
    }
    const rebuiltDatabaseName = String(rebuiltCatalog[0]);
    const rebuiltDatabaseKey = `zerospin/sys_1/gen_1/partitions/partition_1/service/${replicaId}/${rebuiltDatabaseName}`;

    expect(rebuiltDatabaseName).not.toBe(originalDatabaseName);
    expect(JSON.parse(String(rebuiltCatalog[1]))).toEqual([
      originalDatabaseName,
    ]);
    expect(rebuiltCatalog[2]).toBe(Number(originalCatalog[2]) + 1);
    expect(rebuiltCatalog[3]).toBe('1.0.1');
    expect(rebuiltState).toMatchObject({
      replicaIndex: Number(originalCatalog[2]) + 1,
      systemVersion: '1.0.1',
    });
    expect(databaseClients.get(originalDatabaseKey)).toBe(originalDatabase);
    expect(databaseClients.has(rebuiltDatabaseKey)).toBe(true);
    expect(
      originalDatabase.exec(
        "SELECT state FROM serviceReplicaState WHERE id = 'srps_current'",
      )[0]?.values,
    ).toEqual([['{not-json']]);
    expect(firstReplacement).toHaveBeenCalledTimes(1);
    expect(firstReplacement.mock.calls[0]?.[0]).toMatchObject({
      replicaIndex: Number(originalCatalog[2]) + 1,
      systemVersion: '1.0.1',
    });

    await Effect.runPromise(decodeRpc(await firstAcquisition.release()));
    await Effect.runPromise(decodeRpc(await secondAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('fails visibly for a corrupt offline service replica without moving its catalog or opening repair storage', async () => {
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const onlineProvider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-offline-seed',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      ),
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;
    const offlineStateRequest = vi.fn(async () => encodeRight(serviceState));
    const offlineProvider = {
      getFrontendState: offlineStateRequest,
      createFrontendWebSocketTicket: vi.fn(async () => {
        throw new Error('offline ticket must not be requested');
      }),
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const onlineAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: onlineProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await onlineAcquisition.getFrontendState()),
    );
    await Effect.runPromise(decodeRpc(await onlineAcquisition.release()));

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    const originalCatalog = partitionDatabase.exec(
      "SELECT id, databaseName, previousDatabaseNames, replicaIndex FROM serviceFrontendReplicas WHERE status = 'ready'",
    )[0]?.values[0];
    if (originalCatalog === undefined) {
      throw new Error('ready service catalog row missing');
    }
    const originalDatabaseKey = `zerospin/sys_1/gen_1/partitions/partition_1/service/${String(originalCatalog[0])}/${String(originalCatalog[1])}`;
    const originalDatabase = databaseClients.get(originalDatabaseKey);
    if (originalDatabase === undefined) {
      throw new Error('original service database missing');
    }
    originalDatabase.run(
      "UPDATE serviceReplicaState SET state = '{not-json' WHERE id = 'srps_current'",
    );
    const databaseCountBeforeOfflineAcquisition = databaseClients.size;

    const encodedOfflineAcquisition =
      await partitionApi.acquireServiceFrontendReplica({
        serviceName: serviceState.serviceName,
        actorId: serviceState.actorId,
        actorName: serviceState.actorName,
        frontendName: serviceState.frontendName,
        frontendVersion: serviceFrontendSpec.version,
        frontendSpec: serviceFrontendSpec,
        frontendSpecHash: serviceFrontendSpecHash,
        authority: 'cached-offline',
        role: 'active',
        provider: offlineProvider,
      });
    await expect(
      Effect.runPromise(decodeRpc(encodedOfflineAcquisition)),
    ).rejects.toThrow('service-frontend-replica-physical-corruption');
    const preservedCatalog = partitionDatabase.exec(
      'SELECT databaseName, previousDatabaseNames, replicaIndex FROM serviceFrontendReplicas WHERE id = ?',
      [String(originalCatalog[0])],
    )[0]?.values[0];

    expect(preservedCatalog).toEqual([
      originalCatalog[1],
      originalCatalog[2],
      originalCatalog[3],
    ]);
    expect(databaseClients.size).toBe(databaseCountBeforeOfflineAcquisition);
    expect(databaseClients.get(originalDatabaseKey)).toBe(originalDatabase);
    expect(offlineStateRequest).not.toHaveBeenCalled();

    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('keeps the prior service catalog pointer when fresh-database hydration fails before the swap', async () => {
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const seedProvider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-rebuild-rollback-seed',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      ),
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;
    const invalidReplacementState = Schema.validateSync(
      ServiceFrontendStateSchema,
    )({
      ...serviceState,
      resources: [
        {
          id: 'missing_model_1',
          modelName: 'missingModel',
          version: '1.0.0',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    const repairProvider = {
      getFrontendState: vi.fn(async () => encodeRight(invalidReplacementState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-rebuild-rollback-repair',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      ),
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const seedAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: seedProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await seedAcquisition.getFrontendState()),
    );

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    const originalCatalog = partitionDatabase.exec(
      "SELECT id, databaseName, previousDatabaseNames, replicaIndex, frontendIndex FROM serviceFrontendReplicas WHERE status = 'ready'",
    )[0]?.values[0];
    if (originalCatalog === undefined) {
      throw new Error('ready service catalog row missing');
    }
    const originalDatabaseKey = `zerospin/sys_1/gen_1/partitions/partition_1/service/${String(originalCatalog[0])}/${String(originalCatalog[1])}`;
    const originalDatabase = databaseClients.get(originalDatabaseKey);
    if (originalDatabase === undefined) {
      throw new Error('original service database missing');
    }
    originalDatabase.run(
      "UPDATE serviceReplicaState SET state = '{not-json' WHERE id = 'srps_current'",
    );

    const encodedRepairAcquisition =
      await partitionApi.acquireServiceFrontendReplica({
        serviceName: serviceState.serviceName,
        actorId: serviceState.actorId,
        actorName: serviceState.actorName,
        frontendName: serviceState.frontendName,
        frontendVersion: serviceFrontendSpec.version,
        frontendSpec: serviceFrontendSpec,
        frontendSpecHash: serviceFrontendSpecHash,
        authority: 'online',
        role: 'active',
        provider: repairProvider,
      });
    await expect(
      Effect.runPromise(decodeRpc(encodedRepairAcquisition)),
    ).rejects.toThrow('rebuild-service-frontend-replica-failed');
    const preservedCatalog = partitionDatabase.exec(
      'SELECT databaseName, previousDatabaseNames, replicaIndex, frontendIndex FROM serviceFrontendReplicas WHERE id = ?',
      [String(originalCatalog[0])],
    )[0]?.values[0];

    expect(preservedCatalog).toEqual([
      originalCatalog[1],
      originalCatalog[2],
      originalCatalog[3],
      originalCatalog[4],
    ]);
    expect(databaseClients.get(originalDatabaseKey)).toBe(originalDatabase);
    expect(
      originalDatabase.exec(
        "SELECT state FROM serviceReplicaState WHERE id = 'srps_current'",
      )[0]?.values,
    ).toEqual([['{not-json']]);
    expect(seedProvider.replaceFrontendState).not.toHaveBeenCalled();

    await Effect.runPromise(decodeRpc(await seedAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('rebuilds a corrupt account materialization only after verifying and replaying its healthy separate journal', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const firstReplacement = vi.fn(async () => encodeRight(undefined));
    const firstProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-account-rebuild-first',
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
      replaceFrontendState: firstReplacement,
    } satisfies AccountFrontendReplicaProviderApi;
    const secondProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-account-rebuild-second',
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
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_account_rebuild',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_account_rebuild',
      stagedCursor: 'stcur_account_rebuild',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_account_rebuild',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Preserved journal intent' },
        }),
      },
    ]);

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
    const firstAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: firstProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await firstAcquisition.getFrontendState()),
    );
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target: {
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendVersion: accountFrontendSpec.version,
          },
          baseReplicaIndex: 1,
          command,
          mutations,
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    const originalCatalog = partitionDatabase.exec(
      "SELECT id, databaseName, replicaIndex FROM accountFrontendReplicas WHERE status = 'ready'",
    )[0]?.values[0];
    if (originalCatalog === undefined) {
      throw new Error('ready account catalog row missing');
    }
    const replicaId = String(originalCatalog[0]);
    const originalDatabaseName = String(originalCatalog[1]);
    const originalDatabaseKey = `zerospin/sys_1/gen_1/partitions/partition_1/account/${replicaId}/${originalDatabaseName}`;
    const originalDatabase = databaseClients.get(originalDatabaseKey);
    if (originalDatabase === undefined) {
      throw new Error('original account database missing');
    }
    originalDatabase.run(
      "UPDATE accountReplicaState SET state = '{not-json' WHERE id = 'arps_current'",
    );

    const secondAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: secondProvider,
        }),
      ),
    );
    const rebuiltState = await Effect.runPromise(
      decodeRpc(await secondAcquisition.getFrontendState()),
    );
    const rebuiltCatalog = partitionDatabase.exec(
      'SELECT databaseName, previousDatabaseNames, replicaIndex, journalHealth FROM accountFrontendReplicas WHERE id = ?',
      [replicaId],
    )[0]?.values[0];
    if (rebuiltCatalog === undefined) {
      throw new Error('rebuilt account catalog row missing');
    }
    const rebuiltDatabaseName = String(rebuiltCatalog[0]);
    const rebuiltDatabaseKey = `zerospin/sys_1/gen_1/partitions/partition_1/account/${replicaId}/${rebuiltDatabaseName}`;

    expect(rebuiltDatabaseName).not.toBe(originalDatabaseName);
    expect(JSON.parse(String(rebuiltCatalog[1]))).toEqual([
      originalDatabaseName,
    ]);
    expect(rebuiltCatalog[2]).toBe(Number(originalCatalog[2]) + 1);
    expect(rebuiltCatalog[3]).toBe('healthy');
    expect(rebuiltState.replicaIndex).toBe(Number(originalCatalog[2]) + 1);
    expect(rebuiltState.stagedCommands.map(row => row.id)).toEqual([
      command.id,
    ]);
    expect(rebuiltState.resources.map(row => row.id)).toEqual([
      'acct_account_rebuild',
    ]);
    expect(databaseClients.get(originalDatabaseKey)).toBe(originalDatabase);
    expect(databaseClients.has(rebuiltDatabaseKey)).toBe(true);
    expect(
      originalDatabase.exec(
        "SELECT state FROM accountReplicaState WHERE id = 'arps_current'",
      )[0]?.values,
    ).toEqual([['{not-json']]);
    expect(firstReplacement).toHaveBeenCalledTimes(1);

    await Effect.runPromise(decodeRpc(await firstAcquisition.release()));
    await Effect.runPromise(decodeRpc(await secondAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('fails closed on valid wrong-target journal bytes and preserves the owning materialization', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const seedProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-account-corrupt-journal-seed',
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
    } satisfies AccountFrontendReplicaProviderApi;
    const repairStateRequest = vi.fn(async () => encodeRight(accountState));
    const repairProvider = {
      getFrontendState: repairStateRequest,
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-account-corrupt-journal-repair',
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
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_corrupt_ready_journal',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_corrupt_ready_journal',
      stagedCursor: 'stcur_corrupt_ready_journal',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_corrupt_ready_journal',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Do not discard' },
        }),
      },
    ]);
    const wrongTargetCommand = Schema.validateSync(StagedCommandSchema)({
      ...command,
      actorId: 'actr_wrong_target',
    });
    const wrongTargetCommandBytes = Schema.encodeUnknownSync(
      Schema.parseJson(StagedCommandSchema),
    )(wrongTargetCommand);

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
    const seedAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: seedProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await seedAcquisition.getFrontendState()),
    );
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target: {
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendVersion: accountFrontendSpec.version,
          },
          baseReplicaIndex: 1,
          command,
          mutations,
        }),
      ),
    );

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    const originalCatalog = partitionDatabase.exec(
      "SELECT id, databaseName, previousDatabaseNames, replicaIndex FROM accountFrontendReplicas WHERE status = 'ready'",
    )[0]?.values[0];
    if (originalCatalog === undefined) {
      throw new Error('ready account catalog row missing');
    }
    const originalDatabaseKey = `zerospin/sys_1/gen_1/partitions/partition_1/account/${String(originalCatalog[0])}/${String(originalCatalog[1])}`;
    const originalDatabase = databaseClients.get(originalDatabaseKey);
    if (originalDatabase === undefined) {
      throw new Error('original account database missing');
    }
    const originalMaterialization = originalDatabase.exec(
      "SELECT state FROM accountReplicaState WHERE id = 'arps_current'",
    )[0]?.values;
    partitionDatabase.run(
      'UPDATE accountFrontendCommandJournal SET command = ? WHERE commandId = ?',
      [wrongTargetCommandBytes, command.id],
    );
    const databaseCountBeforeRepair = databaseClients.size;

    const encodedRepairAcquisition = await partitionApi.acquireFrontendReplica({
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      frontendName: accountState.frontendName,
      frontendVersion: accountFrontendSpec.version,
      frontendSpec: accountFrontendSpec,
      frontendSpecHash: accountFrontendSpecHash,
      authority: 'online',
      role: 'active',
      provider: repairProvider,
    });
    await expect(
      Effect.runPromise(decodeRpc(encodedRepairAcquisition)),
    ).rejects.toThrow('account-frontend-journal-command-provenance-conflict');
    const preservedCatalog = partitionDatabase.exec(
      'SELECT databaseName, previousDatabaseNames, replicaIndex, journalHealth FROM accountFrontendReplicas WHERE id = ?',
      [String(originalCatalog[0])],
    )[0]?.values[0];

    expect(preservedCatalog).toEqual([
      originalCatalog[1],
      originalCatalog[2],
      originalCatalog[3],
      'corrupt',
    ]);
    expect(databaseClients.size).toBe(databaseCountBeforeRepair);
    expect(databaseClients.get(originalDatabaseKey)).toBe(originalDatabase);
    expect(
      originalDatabase.exec(
        "SELECT state FROM accountReplicaState WHERE id = 'arps_current'",
      )[0]?.values,
    ).toEqual(originalMaterialization);
    expect(
      partitionDatabase.exec(
        'SELECT command FROM accountFrontendCommandJournal WHERE commandId = ?',
        [command.id],
      )[0]?.values,
    ).toEqual([[wrongTargetCommandBytes]]);
    expect(repairStateRequest).not.toHaveBeenCalled();

    await Effect.runPromise(decodeRpc(await seedAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('releases the final account capability and cancels networking when both its block callback and repair callback reject', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const handleBlock = vi.fn(async () => {
      throw new Error('account callback closed');
    });
    const replaceState = vi.fn(async () => {
      throw new Error('account replacement callback closed');
    });
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-account-callback-rejection',
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
      handleFrontendReplicaBlock: handleBlock,
      replaceFrontendState: replaceState,
    } satisfies AccountFrontendReplicaProviderApi;
    const command = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_account_callback_rejection',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_account_callback_rejection',
      stagedCursor: 'stcur_account_callback_rejection',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_account_callback_rejection',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Committed before callback failure' },
        }),
      },
    ]);

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));

    const stageResult = await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target: {
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendVersion: accountFrontendSpec.version,
          },
          baseReplicaIndex: 1,
          command,
          mutations,
        }),
      ),
    );
    const diagnostics = await Effect.runPromise(
      decodeRpc(await partitionApi.listAccountFrontendReplicas()),
    );

    expect(stageResult).toEqual({ commandId: command.id, replicaIndex: 2 });
    expect(handleBlock).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(diagnostics).toMatchObject([
      { activeProviderCount: 0, socketState: 'disconnected' },
    ]);
    expect(webSocketInstances[0]?.close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(webSocketInstances).toHaveLength(1);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('releases the final service capability and cancels networking when both its block callback and repair callback reject', async () => {
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const handleBlock = vi.fn(async () => {
      throw new Error('service callback closed');
    });
    const replaceState = vi.fn(async () => {
      throw new Error('service replacement callback closed');
    });
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-callback-rejection',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      ),
      handleServiceFrontendReplicaBlock: handleBlock,
      replaceFrontendState: replaceState,
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    webSocketInstances[0]?.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    webSocketInstances[0]?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'serviceFrontendBlock',
          sync: {
            kind: 'service-frontend',
            systemId: serviceState.systemId,
            generationId: serviceState.generationId,
            serviceName: serviceState.serviceName,
            actorId: serviceState.actorId,
            actorName: serviceState.actorName,
            frontendName: serviceState.frontendName,
            frontendBlock: {
              serviceName: serviceState.serviceName,
              actorId: serviceState.actorId,
              actorName: serviceState.actorName,
              frontendName: serviceState.frontendName,
              frontendIndex: 1,
              lastServiceCursor: 'svcur_service_callback_rejection',
              delta: { inserted: [], updated: [], deleted: [] },
            },
          },
        }),
      }),
    );
    await vi.waitFor(() => expect(replaceState).toHaveBeenCalledTimes(1));
    const diagnostics = await Effect.runPromise(
      decodeRpc(await partitionApi.listServiceFrontendReplicas()),
    );

    expect(handleBlock).toHaveBeenCalledTimes(1);
    expect(diagnostics).toMatchObject([
      { activeProviderCount: 0, socketState: 'disconnected' },
    ]);
    expect(webSocketInstances[0]?.close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(webSocketInstances).toHaveLength(1);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('treats an equal-index service block with unequal canonical content as corruption and repairs from authority', async () => {
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const repairedServiceState = Schema.validateSync(
      ServiceFrontendStateSchema,
    )({
      ...serviceState,
      frontendIndex: 1,
      systemVersion: '1.0.1',
    });
    const getFrontendState = vi
      .fn()
      .mockImplementationOnce(async () => encodeRight(serviceState))
      .mockImplementation(async () => encodeRight(repairedServiceState));
    const handleBlock = vi.fn(async () => encodeRight(undefined));
    const replaceState = vi.fn(async () => encodeRight(undefined));
    const provider = {
      getFrontendState,
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-service-equal-index-conflict',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      ),
      handleServiceFrontendReplicaBlock: handleBlock,
      replaceFrontendState: replaceState,
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    webSocketInstances[0]?.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    webSocketInstances[0]?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'serviceFrontendBlock',
          sync: {
            kind: 'service-frontend',
            systemId: serviceState.systemId,
            generationId: serviceState.generationId,
            serviceName: serviceState.serviceName,
            actorId: serviceState.actorId,
            actorName: serviceState.actorName,
            frontendName: serviceState.frontendName,
            frontendBlock: {
              serviceName: serviceState.serviceName,
              actorId: serviceState.actorId,
              actorName: serviceState.actorName,
              frontendName: serviceState.frontendName,
              frontendIndex: 1,
              lastServiceCursor: 'svcur_service_equal_index_first',
              delta: { inserted: [], updated: [], deleted: [] },
            },
          },
        }),
      }),
    );
    await vi.waitFor(() => expect(handleBlock).toHaveBeenCalledTimes(1));

    webSocketInstances[0]?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'serviceFrontendBlock',
          sync: {
            kind: 'service-frontend',
            systemId: serviceState.systemId,
            generationId: serviceState.generationId,
            serviceName: serviceState.serviceName,
            actorId: serviceState.actorId,
            actorName: serviceState.actorName,
            frontendName: serviceState.frontendName,
            frontendBlock: {
              serviceName: serviceState.serviceName,
              actorId: serviceState.actorId,
              actorName: serviceState.actorName,
              frontendName: serviceState.frontendName,
              frontendIndex: 1,
              lastServiceCursor: 'svcur_service_equal_index_conflict',
              delta: { inserted: [], updated: [], deleted: [] },
            },
          },
        }),
      }),
    );
    await vi.waitFor(() => expect(replaceState).toHaveBeenCalledTimes(1));
    const repairedReplicaState = await Effect.runPromise(
      decodeRpc(await acquisition.getFrontendState()),
    );

    expect(getFrontendState).toHaveBeenCalledTimes(2);
    expect(handleBlock).toHaveBeenCalledTimes(1);
    expect(repairedReplicaState).toMatchObject({
      frontendIndex: 1,
      replicaIndex: 3,
      systemVersion: '1.0.1',
    });
    expect(replaceState.mock.calls[0]?.[0]).toMatchObject({
      frontendIndex: 1,
      replicaIndex: 3,
      systemVersion: '1.0.1',
    });

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('records exact target-side predecessor journals independently of acquisition and preserves them across upgrades', async () => {
    vi.stubGlobal('location', {
      href: 'https://worker.example/sharedWorker.bundle.js?systemId=sys_1&generationId=gen_2&apiUrl=https%3A%2F%2Fapi.example&publishableKey=pk_test&wasmUrl=https%3A%2F%2Fworker.example%2Fwa-sqlite-async.wasm',
    });
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const targetState = Schema.decodeUnknownSync(FrontendSyncStateSchema)({
      ...accountState,
      generationId: 'gen_2',
    });
    const sourceTarget = {
      generationId: accountState.generationId,
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      frontendName: accountState.frontendName,
      frontendVersion: '0.9.0',
    };
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(targetState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-target-predecessor-proof',
          systemId: targetState.systemId,
          generationId: targetState.generationId,
          accountId: targetState.accountId,
          accountName: targetState.accountName,
          actorId: targetState.actorId,
          actorName: targetState.actorName,
          frontendName: targetState.frontendName,
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
    } satisfies AccountFrontendReplicaProviderApi;

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
    const commissionedAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: targetState.accountId,
          accountName: targetState.accountName,
          actorId: targetState.actorId,
          actorName: targetState.actorName,
          frontendName: targetState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'commissioned',
          provider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await commissionedAcquisition.getFrontendState()),
    );

    const activeAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: targetState.accountId,
          accountName: targetState.accountName,
          actorId: targetState.actorId,
          actorName: targetState.actorName,
          frontendName: targetState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.importAdaptedFrontendCommands({
          target: {
            accountId: targetState.accountId,
            accountName: targetState.accountName,
            actorId: targetState.actorId,
            actorName: targetState.actorName,
            frontendName: targetState.frontendName,
            frontendVersion: accountFrontendSpec.version,
          },
          sourceTarget,
          baseReplicaIndex: 1,
          commands: [],
        }),
      ),
    );

    expect(
      await Effect.runPromise(
        decodeRpc(await partitionApi.listAccountFrontendReplicas()),
      ),
    ).toMatchObject([{ role: 'active', sourceTargets: [sourceTarget] }]);

    await Effect.runPromise(decodeRpc(await activeAcquisition.release()));
    await Effect.runPromise(decodeRpc(await commissionedAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('requires an exact persisted lineage transition before authorizing cross-generation journal migration', async () => {
    const sourceFrontendSpec = {
      ...accountFrontendSpec,
      version: '0.9.0',
    };
    const sourceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(sourceFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-lineage-migration-source',
          systemId: accountState.systemId,
          generationId: 'gen_3',
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
    } satisfies AccountFrontendReplicaProviderApi;

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: sourceFrontendSpec.version,
          frontendSpec: sourceFrontendSpec,
          frontendSpecHash: sourceFrontendSpecHash,
          authority: 'online',
          role: 'commissioned',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));

    const sourceTarget = {
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      frontendName: accountState.frontendName,
      frontendVersion: sourceFrontendSpec.version,
    };
    const target = {
      generationId: 'gen_3',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      frontendName: accountState.frontendName,
      frontendVersion: accountFrontendSpec.version,
    };

    await expect(
      Effect.runPromise(
        decodeRpc(
          await partitionApi.markFrontendCommandsMigrated({
            sourceTarget,
            target,
            commandIds: [],
          }),
        ),
      ),
    ).rejects.toThrow('frontend-journal-migration-lineage-pending');

    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    webSocketInstances[0]?.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    webSocketInstances[0]?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'frontendBlock',
          sync: {
            kind: 'generation-boundary',
            systemId: accountState.systemId,
            prevGenerationId: accountState.generationId,
            generationId: 'gen_2',
            accountId: accountState.accountId,
            accountName: accountState.accountName,
            actorId: accountState.actorId,
            actorName: accountState.actorName,
            frontendName: accountState.frontendName,
            frontendIndex: 1,
          },
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(provider.handleFrontendReplicaBlock).toHaveBeenCalledTimes(1),
    );
    webSocketInstances[0]?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'lineage-transition-required',
          kind: 'lineage-transition-required',
          systemId: accountState.systemId,
          generationId: target.generationId,
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: target.frontendVersion,
          appliedBoundaryIndex: 1,
          remainingBoundaries: [
            {
              kind: 'generation-boundary',
              systemId: accountState.systemId,
              prevGenerationId: 'gen_2',
              generationId: target.generationId,
              accountId: accountState.accountId,
              accountName: accountState.accountName,
              actorId: accountState.actorId,
              actorName: accountState.actorName,
              frontendName: accountState.frontendName,
              frontendIndex: 2,
            },
          ],
        }),
      }),
    );
    await vi.waitFor(async () => {
      const replicas = await Effect.runPromise(
        decodeRpc(await partitionApi.listAccountFrontendReplicas()),
      );
      expect(replicas).toMatchObject([{ hasPendingTransition: true }]);
    });

    await Effect.runPromise(
      decodeRpc(
        await partitionApi.markFrontendCommandsMigrated({
          sourceTarget,
          target,
          commandIds: [],
        }),
      ),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await partitionApi.markFrontendCommandsMigrated({
            sourceTarget,
            target: { ...target, generationId: 'gen_4' },
            commandIds: [],
          }),
        ),
      ),
    ).rejects.toThrow('frontend-journal-migration-lineage-unproven');

    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    partitionDatabase.run(
      'UPDATE accountFrontendReplicas SET pendingTransition = ?',
      [
        JSON.stringify({
          kind: 'lineage-transition-required',
          systemId: accountState.systemId,
          generationId: 'gen_4',
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: target.frontendVersion,
          appliedBoundaryIndex: 1,
          remainingBoundaries: [
            {
              kind: 'generation-boundary',
              systemId: accountState.systemId,
              prevGenerationId: 'gen_missing',
              generationId: 'gen_4',
              accountId: accountState.accountId,
              accountName: accountState.accountName,
              actorId: accountState.actorId,
              actorName: accountState.actorName,
              frontendName: accountState.frontendName,
              frontendIndex: 2,
            },
          ],
        }),
      ],
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await partitionApi.markFrontendCommandsMigrated({
            sourceTarget,
            target: { ...target, generationId: 'gen_4' },
            commandIds: [],
          }),
        ),
      ),
    ).rejects.toThrow('frontend-journal-migration-lineage-unproven');
    expect(
      partitionDatabase.exec(
        `SELECT status, lastFailure, pendingTransition
         FROM accountFrontendReplicas`,
      )[0]?.values[0],
    ).toEqual([
      'failed',
      expect.stringContaining('frontend-journal-migration-lineage-unproven'),
      expect.stringContaining('gen_missing'),
    ]);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('restores a service transition only when its applied boundary and remaining chain are proven', async () => {
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const serviceTicket = vi.fn(async () =>
      encodeRight({
        ticket: 'ticket-service-proven-transition',
        systemId: serviceState.systemId,
        generationId: 'gen_3',
        serviceName: serviceState.serviceName,
        actorId: serviceState.actorId,
        actorName: serviceState.actorName,
        frontendName: serviceState.frontendName,
        frontendVersion: serviceFrontendSpec.version,
      }),
    );
    const serviceProvider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: serviceTicket,
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: serviceProvider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    const serviceSocket = webSocketInstances[0];
    if (serviceSocket === undefined) {
      throw new Error('service transition socket missing');
    }
    serviceSocket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    serviceSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'serviceFrontendBlock',
          sync: {
            kind: 'generation-boundary',
            systemId: serviceState.systemId,
            prevGenerationId: serviceState.generationId,
            generationId: 'gen_2',
            serviceName: serviceState.serviceName,
            actorId: serviceState.actorId,
            actorName: serviceState.actorName,
            frontendName: serviceState.frontendName,
            frontendIndex: 1,
          },
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(
        serviceProvider.handleServiceFrontendReplicaBlock,
      ).toHaveBeenCalledTimes(1),
    );
    serviceSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'lineage-transition-required',
          kind: 'lineage-transition-required',
          systemId: serviceState.systemId,
          generationId: 'gen_3',
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          appliedBoundaryIndex: 1,
          remainingBoundaries: [
            {
              kind: 'generation-boundary',
              systemId: serviceState.systemId,
              prevGenerationId: 'gen_2',
              generationId: 'gen_3',
              serviceName: serviceState.serviceName,
              actorId: serviceState.actorId,
              actorName: serviceState.actorName,
              frontendName: serviceState.frontendName,
              frontendIndex: 2,
            },
          ],
        }),
      }),
    );
    await vi.waitFor(async () => {
      const replicas = await Effect.runPromise(
        decodeRpc(await partitionApi.listServiceFrontendReplicas()),
      );
      expect(replicas[0]?.pendingTransition).toMatchObject({
        generationId: 'gen_3',
        appliedBoundaryIndex: 1,
        remainingBoundaries: [
          {
            prevGenerationId: 'gen_2',
            generationId: 'gen_3',
            frontendIndex: 2,
          },
        ],
      });
    });

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
    await vi.advanceTimersByTimeAsync(0);

    migratePartitionDbAsync.mockImplementation(() =>
      Effect.sync(() => undefined),
    );
    migrateDbAsync.mockImplementation(() => Effect.sync(() => undefined));
    systemApis.clear();
    webSocketInstances.length = 0;
    serviceTicket.mockClear();
    makeSharedWorkerHost();
    const restartedConnect = connectListeners.get('connect');
    if (restartedConnect === undefined) {
      throw new Error('restarted connect listener missing');
    }
    const restartedChannel = new MessageChannel();
    restartedConnect(
      new MessageEvent('connect', { ports: [restartedChannel.port1] }),
    );
    const restartedSystemApi = systemApis.get(0);
    if (restartedSystemApi === undefined) {
      throw new Error('restarted system api missing');
    }
    const restartedPartitionApi = await restartedSystemApi.getPartitionApi({
      partitionKey: 'partition_1',
    });
    const restartedAcquisition = await Effect.runPromise(
      decodeRpc(
        await restartedPartitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: serviceProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await restartedAcquisition.getFrontendState()),
    );
    await vi.advanceTimersByTimeAsync(30_000);

    expect(serviceTicket).not.toHaveBeenCalled();
    expect(webSocketInstances).toHaveLength(0);
    expect(
      await Effect.runPromise(
        decodeRpc(await restartedPartitionApi.listServiceFrontendReplicas()),
      ),
    ).toMatchObject([
      {
        status: 'ready',
        pendingTransition: {
          generationId: 'gen_3',
          appliedBoundaryIndex: 1,
        },
      },
    ]);

    await Effect.runPromise(decodeRpc(await restartedAcquisition.release()));
    restartedSystemApi[Symbol.dispose]();
    restartedChannel.port1.close();
    restartedChannel.port2.close();
  });

  it('retains and reuses one adapted-command materialization, then pushes it only after same-owner promotion', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const sourceFrontendSpec = {
      ...accountFrontendSpec,
      version: '0.9.0',
    };
    const sourceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(sourceFrontendSpec),
    );
    const provider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-adapted-command-import',
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
      pushCommands: vi.fn(
        async (
          commands: Parameters<
            AccountFrontendReplicaProviderApi['pushCommands']
          >[0],
        ) => {
          const command = commands[0];
          if (command === undefined) {
            throw new Error('adapted command missing from promoted push');
          }
          return encodeRight({
            pendingCommands: [
              {
                ...command,
                pushedAt: new Date('2026-01-01T00:00:01.000Z'),
                pushedCursor: 'pcur_adapted_server',
                status: 'pushed',
              },
            ],
            pushedCommands: [],
            failedCommands: [],
          });
        },
      ),
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;
    const sourceProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-adapted-command-source',
          systemId: accountState.systemId,
          generationId: accountState.generationId,
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: sourceFrontendSpec.version,
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
    } satisfies AccountFrontendReplicaProviderApi;
    const sourceCommand = Schema.validateSync(StagedCommandSchema)({
      id: 'cmd_adapted_import',
      commandName: 'createList',
      payload: '{"name":"source"}',
      systemName: main.systemName,
      systemVersion: '0.9.0',
      version: '0.9.0',
      commandType: 'frontend',
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      frontendName: accountState.frontendName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      sessionId: 'sesn_adapted_import',
      stagedCursor: 'stcur_adapted_import',
      stagedAt: new Date('2026-01-01T00:00:00.000Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const adaptedCommand = Schema.validateSync(StagedCommandSchema)({
      ...sourceCommand,
      payload: '{"name":"adapted"}',
      systemVersion: accountState.systemVersion,
      version: '1.0.0',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedFrontendMutationSchema),
    )([]);

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
    const sourceTarget = {
      generationId: accountState.generationId,
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      frontendName: accountState.frontendName,
      frontendVersion: sourceFrontendSpec.version,
    };
    const sourceAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: sourceFrontendSpec.version,
          frontendSpec: sourceFrontendSpec,
          frontendSpecHash: sourceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: sourceProvider,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(await sourceAcquisition.getFrontendState()),
    );
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.stageFrontendCommand({
          target: sourceTarget,
          baseReplicaIndex: 1,
          command: sourceCommand,
          mutations,
        }),
      ),
    );
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'commissioned',
          provider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(2));
    const targetSocket = webSocketInstances.find(socket =>
      socket.url.includes('ticket=ticket-adapted-command-import'),
    );
    if (targetSocket === undefined) {
      throw new Error('adapted target socket missing');
    }
    targetSocket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    targetSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: accountState.generationId,
          frontendIndex: 0,
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    const target = {
      accountId: accountState.accountId,
      accountName: accountState.accountName,
      actorId: accountState.actorId,
      actorName: accountState.actorName,
      frontendName: accountState.frontendName,
      frontendVersion: accountFrontendSpec.version,
    };
    const commands = [{ sourceCommand, adaptedCommand, mutations }];
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.importAdaptedFrontendCommands({
          target,
          sourceTarget,
          baseReplicaIndex: 1,
          commands: [],
        }),
      ),
    );

    await expect(
      Effect.runPromise(
        decodeRpc(
          await partitionApi.importAdaptedFrontendCommands({
            target,
            sourceTarget,
            baseReplicaIndex: 0,
            commands,
          }),
        ),
      ),
    ).rejects.toThrow('adapted-command-base-index-stale');
    const partitionDatabase = databaseClients.get(
      'zerospin/sys_1/gen_1/partitions/partition_1/partition.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    expect(
      partitionDatabase.exec(
        `SELECT journalKind FROM accountFrontendCommandJournal
         WHERE commandId = ? AND journalKind = 'adapted'`,
        [adaptedCommand.id],
      )[0]?.values ?? [],
    ).toEqual([]);

    const firstImport = await Effect.runPromise(
      decodeRpc(
        await partitionApi.importAdaptedFrontendCommands({
          target,
          sourceTarget,
          baseReplicaIndex: 1,
          commands,
        }),
      ),
    );
    const secondImport = await Effect.runPromise(
      decodeRpc(
        await partitionApi.importAdaptedFrontendCommands({
          target,
          sourceTarget,
          baseReplicaIndex: 1,
          commands,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(
        await partitionApi.markFrontendCommandsMigrated({
          sourceTarget,
          target: {
            generationId: accountState.generationId,
            ...target,
          },
          commandIds: [sourceCommand.id],
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.pushCommands).not.toHaveBeenCalled();
    expect(
      await Effect.runPromise(
        decodeRpc(await partitionApi.listAccountFrontendReplicas()),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          frontendVersion: accountFrontendSpec.version,
          role: 'commissioned',
          socketState: 'online',
          activeProviderCount: 1,
        }),
      ]),
    );
    expect(provider.createFrontendWebSocketTicket).toHaveBeenCalledTimes(1);
    expect(webSocketInstances).toHaveLength(2);
    expect(targetSocket.send).toHaveBeenCalledTimes(1);

    const activeAcquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider,
        }),
      ),
    );
    expect(
      await Effect.runPromise(
        decodeRpc(await partitionApi.listAccountFrontendReplicas()),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          frontendVersion: accountFrontendSpec.version,
          role: 'active',
          socketState: 'online',
          activeProviderCount: 1,
        }),
      ]),
    );

    // Promotion itself schedules the already-materialized journal. The live
    // socket remains online, so no second ticket, socket, or replay is needed.
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(provider.pushCommands).toHaveBeenCalledTimes(1),
    );
    expect(provider.pushCommands.mock.calls[0]?.[0]).toEqual([adaptedCommand]);
    expect(provider.createFrontendWebSocketTicket).toHaveBeenCalledTimes(1);
    expect(webSocketInstances).toHaveLength(2);
    expect(targetSocket.send).toHaveBeenCalledTimes(1);

    const state = await Effect.runPromise(
      decodeRpc(await activeAcquisition.getFrontendState()),
    );
    const journalRows = partitionDatabase.exec(
      `SELECT commandId, sourceGenerationId, frontendVersion, journalKind,
              lifecycle, targetGenerationId, targetFrontendVersion,
              materializedReplicaIndex
       FROM accountFrontendCommandJournal WHERE commandId = ?
       ORDER BY journalKind`,
      [adaptedCommand.id],
    )[0]?.values;

    expect(firstImport).toEqual({
      commandIds: [adaptedCommand.id],
      replicaIndex: 2,
    });
    expect(secondImport).toEqual(firstImport);
    expect(journalRows).toEqual([
      [
        adaptedCommand.id,
        sourceTarget.generationId,
        sourceTarget.frontendVersion,
        'adapted',
        'pushed',
        accountState.generationId,
        accountFrontendSpec.version,
        3,
      ],
      [
        sourceCommand.id,
        sourceTarget.generationId,
        sourceTarget.frontendVersion,
        'source',
        'migrated',
        accountState.generationId,
        accountFrontendSpec.version,
        2,
      ],
    ]);
    expect(state.stagedCommands).toEqual([]);
    expect(state.pushedCommands.map(command => command.id)).toEqual([
      adaptedCommand.id,
    ]);

    await Effect.runPromise(decodeRpc(await activeAcquisition.release()));
    await Effect.runPromise(decodeRpc(await acquisition.release()));
    await Effect.runPromise(decodeRpc(await sourceAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('retains an account provider after an encoded ticket transport failure and reconnects with a later ticket', async () => {
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const accountTicket = vi
      .fn()
      .mockResolvedValueOnce(
        encodeLeft(
          new ZerospinError({
            code: 'async-failed',
            message: 'Account ticket transport is temporarily unavailable',
          }),
        ),
      )
      .mockResolvedValue(
        encodeRight({
          ticket: 'ticket-account-after-transport-recovery',
          systemId: accountState.systemId,
          generationId: accountState.generationId,
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
        }),
      );
    const accountProvider = {
      getFrontendState: vi.fn(async () => encodeRight(accountState)),
      createFrontendWebSocketTicket: accountTicket,
      pushCommands: vi.fn(async () =>
        encodeRight({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
      ),
      handleFrontendReplicaBlock: vi.fn(async () => encodeRight(undefined)),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies AccountFrontendReplicaProviderApi;

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireFrontendReplica({
          accountId: accountState.accountId,
          accountName: accountState.accountName,
          actorId: accountState.actorId,
          actorName: accountState.actorName,
          frontendName: accountState.frontendName,
          frontendVersion: accountFrontendSpec.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: accountProvider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));

    // The encoded transport failure is retryable. It must not be treated like
    // a rejected or disconnected provider capability.
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(accountTicket).toHaveBeenCalledTimes(1));
    const failedDiagnostics = await Effect.runPromise(
      decodeRpc(await partitionApi.listAccountFrontendReplicas()),
    );
    expect(failedDiagnostics).toMatchObject([
      {
        activeProviderCount: 1,
        socketState: 'disconnected',
        reconnectAttempt: 1,
        lastFailure: {
          code: 'async-failed',
          message: 'Account ticket transport is temporarily unavailable',
        },
      },
    ]);
    expect(webSocketInstances).toHaveLength(0);

    // The scheduled reconnect asks the same retained provider for a fresh
    // one-use ticket and opens the account archive socket.
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(accountTicket).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    const accountSocket = webSocketInstances[0];
    if (accountSocket === undefined) {
      throw new Error('reconnected account socket missing');
    }
    expect(accountSocket.url).toContain(
      'ticket=ticket-account-after-transport-recovery',
    );

    // Replay completion is the online barrier and clears the reconnect state
    // without changing provider ownership.
    accountSocket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    accountSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: accountState.generationId,
          frontendIndex: accountState.frontendIndex,
        }),
      }),
    );
    await vi.waitFor(async () => {
      const recoveredDiagnostics = await Effect.runPromise(
        decodeRpc(await partitionApi.listAccountFrontendReplicas()),
      );
      expect(recoveredDiagnostics).toMatchObject([
        {
          activeProviderCount: 1,
          socketState: 'online',
          reconnectAttempt: 0,
          lastFailure: null,
        },
      ]);
    });

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('retains a service provider after an encoded ticket transport failure and reconnects with a later ticket', async () => {
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const serviceTicket = vi
      .fn()
      .mockResolvedValueOnce(
        encodeLeft(
          new ZerospinError({
            code: 'async-failed',
            message: 'Service ticket transport is temporarily unavailable',
          }),
        ),
      )
      .mockResolvedValue(
        encodeRight({
          ticket: 'ticket-service-after-transport-recovery',
          systemId: serviceState.systemId,
          generationId: serviceState.generationId,
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
        }),
      );
    const serviceProvider = {
      getFrontendState: vi.fn(async () => encodeRight(serviceState)),
      createFrontendWebSocketTicket: serviceTicket,
      handleServiceFrontendReplicaBlock: vi.fn(async () =>
        encodeRight(undefined),
      ),
      replaceFrontendState: vi.fn(async () => encodeRight(undefined)),
    } satisfies ServiceFrontendReplicaProviderApi;

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
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await partitionApi.acquireServiceFrontendReplica({
          serviceName: serviceState.serviceName,
          actorId: serviceState.actorId,
          actorName: serviceState.actorName,
          frontendName: serviceState.frontendName,
          frontendVersion: serviceFrontendSpec.version,
          frontendSpec: serviceFrontendSpec,
          frontendSpecHash: serviceFrontendSpecHash,
          authority: 'online',
          role: 'active',
          provider: serviceProvider,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getFrontendState()));

    // The encoded transport failure is retryable. It must not be treated like
    // a rejected or disconnected provider capability.
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(serviceTicket).toHaveBeenCalledTimes(1));
    const failedDiagnostics = await Effect.runPromise(
      decodeRpc(await partitionApi.listServiceFrontendReplicas()),
    );
    expect(failedDiagnostics).toMatchObject([
      {
        activeProviderCount: 1,
        socketState: 'disconnected',
        reconnectAttempt: 1,
        lastFailure: {
          code: 'async-failed',
          message: 'Service ticket transport is temporarily unavailable',
        },
      },
    ]);
    expect(webSocketInstances).toHaveLength(0);

    // The scheduled reconnect asks the same retained provider for a fresh
    // one-use ticket and opens the service archive socket.
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(serviceTicket).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    const serviceSocket = webSocketInstances[0];
    if (serviceSocket === undefined) {
      throw new Error('reconnected service socket missing');
    }
    expect(serviceSocket.url).toContain(
      'ticket=ticket-service-after-transport-recovery',
    );

    // Replay completion is the online barrier and clears the reconnect state
    // without changing provider ownership.
    serviceSocket.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(0);
    serviceSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: serviceState.generationId,
          frontendIndex: serviceState.frontendIndex,
        }),
      }),
    );
    await vi.waitFor(async () => {
      const recoveredDiagnostics = await Effect.runPromise(
        decodeRpc(await partitionApi.listServiceFrontendReplicas()),
      );
      expect(recoveredDiagnostics).toMatchObject([
        {
          activeProviderCount: 1,
          socketState: 'online',
          reconnectAttempt: 0,
          lastFailure: null,
        },
      ]);
    });

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });
});
