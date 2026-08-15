import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
  FailedStagedReplicaCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  StagedSessionCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAggregateFrontendMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IEncodedCommand,
  IStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import { makeInMemorySqlJsDatabase } from '@zerospin/core/drizzle/makeInMemorySqlJsDatabase';
import { makeTableMigrationStatements } from '@zerospin/core/drizzle/makeTableMigrationSQL';
import { List, main, User } from '@zerospin/core/fixtures/system';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import { makeServiceModel } from '@zerospin/core/models/makeServiceModel';
import { primitives } from '@zerospin/core/models/primitives';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { ServiceFrontendStateSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import { AggregateFrontendSyncStateSchema } from '@zerospin/core/session/AggregateFrontendBlockSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { RpcStub, RpcTarget } from 'capnweb';
import { drizzle } from 'drizzle-orm/sql-js';
import { Effect, Exit, Layer, ManagedRuntime, Redacted, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AggregateFrontendReplicaSinkApi,
  ServiceFrontendReplicaSinkApi,
  UserPartitionRepo,
} from '../acquireUserPartitionRepo.ts';

import { AggregateFrontendReplicaRepo } from './AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import { userReplicaMigrations } from './drizzle/userReplica/migrations.ts';
import type { ServiceFrontendReplicaRepo } from './ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';
import { UserPartitionRepo as SharedWorkerUserPartitionRepo } from './UserPartitionRepo/UserPartitionRepo.ts';
import { userReplicaDbConfig } from './userReplicaSchemas.ts';

const aggregateFrontendSpec = makeFrontendControllerSpec(main);
const aggregateFrontendLockKey = await Effect.runPromise(
  makeAggregateFrontendLockKey(aggregateFrontendSpec.aggregateFrontendLock),
);
const alternateAggregateFrontendLock = Schema.decodeUnknownSync(
  AggregateFrontendLockSchema,
)({
  ...aggregateFrontendSpec.aggregateFrontendLock,
  models: {
    ...aggregateFrontendSpec.aggregateFrontendLock.models,
    account: {
      ...aggregateFrontendSpec.aggregateFrontendLock.models.account,
      version: '2.0.0',
    },
  },
});
const alternateAggregateFrontendLockKey = await Effect.runPromise(
  makeAggregateFrontendLockKey(alternateAggregateFrontendLock),
);
const alternateAggregateFrontendSpec = {
  ...aggregateFrontendSpec,
  aggregateFrontendLock: alternateAggregateFrontendLock,
};
const unavailableAggregateFrontendLock = Schema.decodeUnknownSync(
  AggregateFrontendLockSchema,
)({
  ...aggregateFrontendSpec.aggregateFrontendLock,
  models: {
    ...aggregateFrontendSpec.aggregateFrontendLock.models,
    account: {
      ...aggregateFrontendSpec.aggregateFrontendLock.models.account,
      version: '3.0.0',
    },
  },
});
const unavailableAggregateFrontendLockKey = await Effect.runPromise(
  makeAggregateFrontendLockKey(unavailableAggregateFrontendLock),
);
const unavailableAggregateFrontendSpec = {
  ...aggregateFrontendSpec,
  aggregateFrontendLock: unavailableAggregateFrontendLock,
};
const ServiceCategory = makeServiceModel(
  {
    serviceName: 'catalog',
    abbreviation: 'cat',
    modelName: 'category',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
const ServiceProduct = makeServiceModel(
  {
    serviceName: 'catalog',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      categoryId: primitives.ref({
        table: ServiceCategory.table,
        relation: 'category',
        inverse: 'products',
      }),
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
const serviceFrontend = makeFrontendController({
  systemName: 'system-worker',
  serviceName: 'catalog',
  frontendName: 'catalog',
  models: { category: ServiceCategory, product: ServiceProduct },
});
const serviceFrontendSpec = makeFrontendControllerSpec(serviceFrontend);
const serviceFrontendLockKey = await Effect.runPromise(
  makeServiceFrontendLockKey(serviceFrontendSpec.serviceFrontendLock),
);

const aggregateState = Schema.decodeUnknownSync(
  AggregateFrontendSyncStateSchema,
)({
  aggregateId: 'acct_1',
  userId: 'user_1',
  systemId: 'sys_1',
  systemVersion: '1.0.0',
  aggregateName: main.aggregateName,
  frontendName: main.frontendName,
  frontendIndex: 0,
  pushedCommands: [],
  resources: [],
  executedPushedCommands: [],
  failedPushedCommands: [],
});
const serviceState = Schema.decodeUnknownSync(ServiceFrontendStateSchema)({
  userId: 'user_1',
  systemId: 'sys_1',
  systemVersion: '1.0.0',
  serviceName: serviceFrontend.serviceName,
  frontendName: serviceFrontend.frontendName,
  frontendIndex: 0,
  resources: [],
});

function makeAggregateFrontendApi<STATE, TICKET, PUSH>(authority: {
  getState(): Promise<STATE>;
  createWebSocketTicket(): Promise<TICKET>;
  pushCommands(
    commands: readonly IEncodedCommand<IStagedReplicaCommand>[],
  ): Promise<PUSH>;
}) {
  return {
    getState: vi.fn(async () => ({
      result: await authority.getState(),
      link: null,
    })),
    createWebSocketTicket: vi.fn(async () => ({
      result: await authority.createWebSocketTicket(),
      link: null,
    })),
    pushCommands: vi.fn(
      async (request: {
        args: [
          {
            commands: readonly IEncodedCommand<IStagedReplicaCommand>[];
          },
        ];
      }) => ({
        result: await authority.pushCommands(request.args[0].commands),
        link: null,
      }),
    ),
    [Symbol.dispose]: vi.fn(),
  };
}

function makeServiceFrontendApi<STATE, TICKET>(authority: {
  getState(): Promise<STATE>;
  createWebSocketTicket(): Promise<TICKET>;
}) {
  return {
    getState: vi.fn(async () => ({
      result: await authority.getState(),
      link: null,
    })),
    createWebSocketTicket: vi.fn(async () => ({
      result: await authority.createWebSocketTicket(),
      link: null,
    })),
    [Symbol.dispose]: vi.fn(),
  };
}

function makeAggregateSink(): AggregateFrontendReplicaSinkApi {
  return {
    handleBlock: vi.fn(async () => encodeRight(undefined)),
    replaceState: vi.fn(async () => encodeRight(undefined)),
    handleFailure: vi.fn(async () => encodeRight(undefined)),
  };
}

function makeServiceSink(): ServiceFrontendReplicaSinkApi {
  return {
    handleBlock: vi.fn(async () => encodeRight(undefined)),
    replaceState: vi.fn(async () => encodeRight(undefined)),
    handleFailure: vi.fn(async () => encodeRight(undefined)),
  };
}

const addEventListener = vi.hoisted(() => vi.fn());
const connectListeners = vi.hoisted(
  () => new Map<string, (event: MessageEvent) => void>(),
);
const systemApis = vi.hoisted(
  () =>
    new Map<
      number,
      {
        getUserPartitionRepo(
          request: ReturnType<typeof makePartitionRequest>,
        ): Promise<
          Schema.EitherEncoded<
            {
              api: UserPartitionRepo;
              systemId: string;
              userId: string;
              mode: 'online' | 'existing-only';
            },
            IAnyErrorJson
          >
        >;
        [Symbol.dispose](): void;
      }
    >(),
);
const newMessagePortRpcSession = vi.hoisted(() => vi.fn());
const newWebSocketRpcSession = vi.hoisted(() => vi.fn());
const authenticatedApisByToken = vi.hoisted(() => new Map<string, object>());
const authenticationIdentitiesByToken = vi.hoisted(
  () =>
    new Map<
      string,
      {
        systemId: string;
        systemName: string;
        systemVersions: string[];
        userId: string;
      }
    >(),
);
const authenticationBarriersByToken = vi.hoisted(
  () => new Map<string, Promise<void>>(),
);
const authenticationFailuresByToken = vi.hoisted(
  () => new Map<string, ZerospinError>(),
);
const locatorRecords = vi.hoisted(
  () => new Map<string, { key: string; systemId: string; userId: string }>(),
);
const locatorDatabases = vi.hoisted(
  () => new Array<{ close: ReturnType<typeof vi.fn> }>(),
);
const openLastUserPartitionStore = vi.hoisted(() => vi.fn());
const getLastUserPartition = vi.hoisted(() => vi.fn());
const setLastUserPartition = vi.hoisted(() => vi.fn());
const makeIdbSQLite3 = vi.hoisted(() => vi.fn());
const makeAsyncWaSqliteDrizzle = vi.hoisted(() => vi.fn());
const makeTxAsync = vi.hoisted(() => vi.fn());
const migrateDbAsync = vi.hoisted(() => vi.fn());
const migrateUserReplicaDbAsync = vi.hoisted(() => vi.fn());
const databaseClients = vi.hoisted(
  () =>
    new Map<string, Awaited<ReturnType<typeof makeInMemorySqlJsDatabase>>>(),
);
const databaseStatementBarriers = vi.hoisted(
  () =>
    new Map<
      string,
      Readonly<{
        entered(): void;
        barrier: Promise<void>;
      }>
    >(),
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

function makeAuthenticatedApi(props: {
  systemId: string;
  userId: string;
  aggregateFrontendApi?: ReturnType<typeof makeAggregateFrontendApi>;
  aggregateAdmission?: Readonly<{
    entered(): void;
    barrier: Promise<void>;
  }>;
  aggregateAdmissionFailure?: ZerospinError;
  aggregateAdmissionMalformed?: boolean;
  aggregateAdmissionSystemId?: string;
  aggregateSpec?: typeof aggregateFrontendSpec;
  aggregateFrontends?: readonly Readonly<{
    frontendApi: ReturnType<typeof makeAggregateFrontendApi>;
    frontendSpec: typeof aggregateFrontendSpec;
  }>[];
  serviceFrontendApi?: ReturnType<typeof makeServiceFrontendApi>;
  serviceAdmission?: Readonly<{
    entered(): void;
    barrier: Promise<void>;
  }>;
  serviceAdmissionFailure?: ZerospinError;
  serviceAdmissionMalformed?: boolean;
  serviceAdmissionUserId?: string;
}) {
  return {
    getAggregateFrontendApi: vi.fn(async request => {
      const selectedAggregateFrontend = props.aggregateFrontends?.find(
        candidate =>
          JSON.stringify(candidate.frontendSpec.aggregateFrontendLock) ===
          JSON.stringify(request.aggregateFrontendLock),
      );
      const frontendApi =
        selectedAggregateFrontend?.frontendApi ?? props.aggregateFrontendApi;
      if (frontendApi === undefined) {
        throw new Error('aggregate frontend authority is unavailable');
      }
      return {
        ...frontendApi,
        getAdmission: vi.fn(async () => {
          props.aggregateAdmission?.entered();
          await props.aggregateAdmission?.barrier;
          return props.aggregateAdmissionFailure === undefined
            ? encodeRight({
                actorRef: {
                  aggregateId: request.aggregateId,
                  aggregateName: request.aggregateName,
                  userId: props.userId,
                },
                frontendName: request.frontendName,
                aggregateFrontendLock:
                  props.aggregateAdmissionMalformed === true
                    ? null
                    : request.aggregateFrontendLock,
                systemId: props.aggregateAdmissionSystemId ?? props.systemId,
                systemVersion: '1.0.0',
                frontendSpec:
                  selectedAggregateFrontend?.frontendSpec ??
                  props.aggregateSpec ??
                  aggregateFrontendSpec,
              })
            : encodeLeft(props.aggregateAdmissionFailure);
        }),
      };
    }),
    getServiceFrontendApi: vi.fn(async request => {
      if (props.serviceFrontendApi === undefined) {
        throw new Error('service frontend authority is unavailable');
      }
      return {
        ...props.serviceFrontendApi,
        getAdmission: vi.fn(async () => {
          props.serviceAdmission?.entered();
          await props.serviceAdmission?.barrier;
          return props.serviceAdmissionFailure === undefined
            ? encodeRight({
                userId: props.serviceAdmissionUserId ?? props.userId,
                systemId: props.systemId,
                systemVersion: '1.0.0',
                serviceName: request.serviceName,
                frontendName: request.frontendName,
                serviceFrontendLock:
                  props.serviceAdmissionMalformed === true
                    ? null
                    : request.serviceFrontendLock,
                frontendSpec: serviceFrontendSpec,
              })
            : encodeLeft(props.serviceAdmissionFailure);
        }),
      };
    }),
  };
}

let nextAuthenticationToken = 0;
function makePartitionRequest(
  authenticatedApi: ReturnType<typeof makeAuthenticatedApi>,
  options?: {
    authenticationBarrier?: Promise<void>;
    authenticationFailure?: ZerospinError;
    systemId?: string;
    systemName?: string;
    systemVersions?: string[];
    userId?: string;
  },
) {
  nextAuthenticationToken += 1;
  const token = `authentication-${nextAuthenticationToken}`;
  authenticatedApisByToken.set(token, authenticatedApi);
  authenticationIdentitiesByToken.set(token, {
    systemId: options?.systemId ?? 'sys_1',
    systemName: options?.systemName ?? 'system-worker',
    systemVersions: options?.systemVersions ?? ['1.0.0'],
    userId: options?.userId ?? 'user_1',
  });
  if (options?.authenticationBarrier !== undefined) {
    authenticationBarriersByToken.set(token, options.authenticationBarrier);
  }
  if (options?.authenticationFailure !== undefined) {
    authenticationFailuresByToken.set(token, options.authenticationFailure);
  }
  return {
    systemName: 'system-worker',
    authenticationLock: {
      signature: { version: '1.0.0', schemaJsonSchema: { type: 'object' } },
    },
    generateSignature: vi.fn(async () => encodeRight({ token })),
  };
}

async function openUserPartition(
  systemApi: {
    getUserPartitionRepo(
      request: ReturnType<typeof makePartitionRequest>,
    ): Promise<
      Schema.EitherEncoded<
        {
          api: UserPartitionRepo;
          systemId: string;
          userId: string;
          mode: 'online' | 'existing-only';
        },
        IAnyErrorJson
      >
    >;
  },
  authenticatedApi: ReturnType<typeof makeAuthenticatedApi>,
  options?: Parameters<typeof makePartitionRequest>[1],
) {
  const acquired = await Effect.runPromise(
    decodeRpc(
      await systemApi.getUserPartitionRepo(
        makePartitionRequest(authenticatedApi, options),
      ),
    ),
  );
  return acquired.api;
}

vi.mock('capnweb', async importOriginal => ({
  ...(await importOriginal()),
  newMessagePortRpcSession,
  newWebSocketRpcSession,
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

vi.mock('./migrateUserReplicaDbAsync.ts', () => ({
  migrateUserReplicaDbAsync,
}));

vi.mock('./lastUserPartitionStore.ts', () => ({
  openLastUserPartitionStore,
  getLastUserPartition,
  setLastUserPartition,
}));

describe('startSharedWorker invariants', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    addEventListener.mockReset();
    connectListeners.clear();
    systemApis.clear();
    newMessagePortRpcSession.mockReset();
    newWebSocketRpcSession.mockReset();
    authenticatedApisByToken.clear();
    authenticationIdentitiesByToken.clear();
    authenticationBarriersByToken.clear();
    authenticationFailuresByToken.clear();
    locatorRecords.clear();
    locatorDatabases.length = 0;
    openLastUserPartitionStore.mockReset();
    getLastUserPartition.mockReset();
    setLastUserPartition.mockReset();
    nextAuthenticationToken = 0;
    makeIdbSQLite3.mockReset();
    makeAsyncWaSqliteDrizzle.mockReset();
    makeTxAsync.mockReset();
    migrateDbAsync.mockReset();
    migrateUserReplicaDbAsync.mockReset();
    databaseStatementBarriers.clear();
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
          getUserPartitionRepo(
            request: ReturnType<typeof makePartitionRequest>,
          ): Promise<
            Schema.EitherEncoded<
              {
                api: UserPartitionRepo;
                systemId: string;
                userId: string;
                mode: 'online' | 'existing-only';
              },
              IAnyErrorJson
            >
          >;
          [Symbol.dispose](): void;
        },
      ) => {
        systemApis.set(systemApis.size, api);
        return {};
      },
    );
    newWebSocketRpcSession.mockImplementation(() => ({
      getAuthenticatedApi: vi.fn(async request => {
        const token = Reflect.get(request.signature, 'token');
        await authenticationBarriersByToken.get(token);
        const authenticationFailure = authenticationFailuresByToken.get(token);
        if (authenticationFailure !== undefined) {
          throw authenticationFailure;
        }
        const authenticatedApi = authenticatedApisByToken.get(token);
        const identity = authenticationIdentitiesByToken.get(token);
        if (authenticatedApi === undefined || identity === undefined) {
          throw new Error('authentication token is not registered');
        }
        return {
          ...authenticatedApi,
          getAuthentication: vi.fn(async () =>
            encodeRight({
              authenticationLock: request.authenticationLock,
              systemId: identity.systemId,
              systemName: identity.systemName,
              systemVersion:
                identity.systemVersions.shift() ??
                identity.systemVersions[identity.systemVersions.length - 1] ??
                '1.0.0',
              userId: identity.userId,
            }),
          ),
        };
      }),
      [Symbol.dispose]: vi.fn(),
    }));
    makeIdbSQLite3.mockImplementation(
      async (props: {
        databaseName: string;
        mode: 'create-or-open' | 'existing-only';
        vfsName: string;
        wasmUrl: string;
      }) => {
        const databaseKey = `${props.vfsName}/${props.databaseName}`;
        const existing = databaseClients.get(databaseKey);
        if (existing !== undefined) return existing;
        if (props.mode === 'existing-only') {
          throw new Error(`IndexedDB VFS does not exist: ${props.vfsName}`);
        }
        const database = await makeInMemorySqlJsDatabase();
        const prepare = database.prepare.bind(database);
        Reflect.set(database, 'prepare', (statementSql: string) => {
          const statement = prepare(statementSql);
          const matchedBarrier = [...databaseStatementBarriers].find(
            ([sqlFragment]) => statementSql.includes(sqlFragment),
          );
          if (matchedBarrier !== undefined) {
            const [sqlFragment, control] = matchedBarrier;
            const run = statement.run.bind(statement);
            Reflect.set(
              statement,
              'run',
              (...parameters: Parameters<typeof statement.run>) => {
                const result = run(...parameters);
                databaseStatementBarriers.delete(sqlFragment);
                control.entered();
                return control.barrier.then(() => result);
              },
            );
          }
          return statement;
        });
        Reflect.set(database, 'sqlite3', {
          close: vi.fn(async () => undefined),
        });
        Reflect.set(database, 'vfs', {
          close: vi.fn(async () => undefined),
          xDelete: vi.fn(async () => {
            databaseClients.delete(databaseKey);
            return 0;
          }),
        });
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
    migrateUserReplicaDbAsync.mockImplementation(props =>
      props.mode === 'existing-only'
        ? Effect.void
        : Effect.sync(() => {
            const client = Reflect.get(props.db, '$client');
            for (const migration of userReplicaMigrations) {
              for (const statement of migration.sql) {
                client.run(statement);
              }
            }
          }),
    );
    migrateDbAsync.mockImplementation(
      (props: {
        db: object;
        schema: Record<
          string,
          Parameters<typeof makeTableMigrationStatements>[0]
        >;
      }) =>
        Effect.sync(() => {
          const client = Reflect.get(props.db, '$client');
          for (const drizzleSchema of Object.values(props.schema)) {
            for (const statement of makeTableMigrationStatements(
              drizzleSchema,
            )) {
              try {
                client.run(statement);
              } catch (cause) {
                if (!String(cause).includes('already exists')) throw cause;
              }
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
      href: 'https://worker.example/sharedWorker.bundle.js?apiUrl=https%3A%2F%2Fapi.example&publishableKey=pk_test&wasmUrl=https%3A%2F%2Fworker.example%2Fwa-sqlite-async.wasm',
    });
    openLastUserPartitionStore.mockImplementation(() =>
      Effect.sync(() => {
        const database = { close: vi.fn() };
        locatorDatabases.push(database);
        return database;
      }),
    );
    getLastUserPartition.mockImplementation(props =>
      Effect.succeed(locatorRecords.get(props.key) ?? null),
    );
    setLastUserPartition.mockImplementation(props =>
      Effect.sync(() => {
        locatorRecords.set(props.record.key, props.record);
      }),
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const database of databaseClients.values()) {
      database.close();
    }
    databaseClients.clear();
    databaseStatementBarriers.clear();
  });

  it('single-flights concurrent online authentication and retains one signature capability until port release', async () => {
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const authenticationBarrier = Promise.withResolvers<void>();
    const request = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: makeAggregateFrontendApi({
          getState: vi.fn(async () => encodeRight(aggregateState)),
          createWebSocketTicket: vi.fn(async () =>
            encodeRight({ ticket: 'ticket-root-single-flight' }),
          ),
          pushCommands: vi.fn(async () =>
            encodeRight({
              writeIndex: 1,
              guardedAtAggregateCursor: null,
              pendingCommands: [],
              pushedCommands: [],
              executedCommands: [],
              failedStagedCommands: [],
              failedPushedCommands: [],
            }),
          ),
        }),
      }),
      { authenticationBarrier: authenticationBarrier.promise },
    );
    const releaseSignatureCapability = vi.fn();
    const generateSignature = Object.assign(request.generateSignature, {
      [Symbol.dispose]: releaseSignatureCapability,
    });
    const signatureCapability = new RpcStub(generateSignature);
    const capabilityRequest = {
      ...request,
      generateSignature: signatureCapability,
    };

    const firstOpening = systemApi
      .getUserPartitionRepo(capabilityRequest)
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    const secondOpening = systemApi
      .getUserPartitionRepo(capabilityRequest)
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await vi.waitFor(() => {
      expect(generateSignature).toHaveBeenCalledTimes(1);
      expect(newWebSocketRpcSession).toHaveBeenCalledTimes(1);
    });
    expect(openLastUserPartitionStore).not.toHaveBeenCalled();
    expect(makeIdbSQLite3).not.toHaveBeenCalled();
    authenticationBarrier.resolve();
    const [first, second] = await Promise.all([firstOpening, secondOpening]);
    expect(first).toMatchObject({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      mode: 'online',
    });
    expect(second).toMatchObject({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      mode: 'online',
    });
    expect(generateSignature).toHaveBeenCalledTimes(1);
    expect(newWebSocketRpcSession).toHaveBeenCalledTimes(1);
    expect(openLastUserPartitionStore).toHaveBeenCalledTimes(2);
    expect(makeIdbSQLite3).toHaveBeenCalledTimes(1);
    expect(makeIdbSQLite3).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'create-or-open',
        vfsName: 'zerospin/056/sys_1/users/user_1',
      }),
    );
    expect(setLastUserPartition).toHaveBeenCalledTimes(2);
    expect(locatorDatabases).toHaveLength(2);
    expect(locatorDatabases[0]?.close).toHaveBeenCalledTimes(1);
    expect(locatorDatabases[1]?.close).toHaveBeenCalledTimes(1);
    signatureCapability[Symbol.dispose]();
    expect(releaseSignatureCapability).not.toHaveBeenCalled();

    systemApi[Symbol.dispose]();
    expect(releaseSignatureCapability).toHaveBeenCalledTimes(1);
    expect(
      newWebSocketRpcSession.mock.results[0]?.value[Symbol.dispose],
    ).toHaveBeenCalledTimes(1);
    channel.port1.close();
    channel.port2.close();
  });

  it.each([
    'user-authentication-transport-failed',
    'gateway-infrastructure-failure',
    'system-deploy-activating',
    'system-deploy-failed',
    'system-not-ready',
  ])(
    'uses the strict locator and existing-only user root after initial %s',
    async authenticationFailureCode => {
      const seededUserReplicaSqlite = await makeIdbSQLite3({
        databaseName: 'replicas.db',
        mode: 'create-or-open',
        vfsName: 'zerospin/056/sys_1/users/user_1',
        wasmUrl: 'https://worker.example/wa-sqlite-async.wasm',
      });
      const seededUserReplicaDb = makeAsyncWaSqliteDrizzle(
        seededUserReplicaSqlite,
        userReplicaDbConfig,
      );
      await Effect.runPromise(
        migrateUserReplicaDbAsync({
          db: seededUserReplicaDb,
          mode: 'create-or-open',
        }),
      );
      makeIdbSQLite3.mockClear();
      makeAsyncWaSqliteDrizzle.mockClear();
      migrateUserReplicaDbAsync.mockClear();

      const { startSharedWorker } = await import('./startSharedWorker.js');
      startSharedWorker();
      const connect = connectListeners.get('connect');
      if (connect === undefined) throw new Error('connect listener missing');
      const channel = new MessageChannel();
      connect(new MessageEvent('connect', { ports: [channel.port1] }));
      const systemApi = systemApis.get(0);
      if (systemApi === undefined) throw new Error('system api missing');
      const request = makePartitionRequest(
        makeAuthenticatedApi({
          systemId: aggregateState.systemId,
          userId: aggregateState.userId,
        }),
        {
          authenticationFailure: new ZerospinError({
            code: authenticationFailureCode,
            message: 'Initial authentication is temporarily unavailable',
          }),
        },
      );
      const locatorKey = JSON.stringify({
        apiUrl: 'https://api.example',
        publishableKey: 'pk_test',
        systemName: request.systemName,
        authenticationLock: request.authenticationLock,
      });
      locatorRecords.set(locatorKey, {
        key: locatorKey,
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      });

      const acquired = await Effect.runPromise(
        decodeRpc(await systemApi.getUserPartitionRepo(request)),
      );
      expect(acquired).toMatchObject({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        mode: 'existing-only',
      });
      expect(request.generateSignature).toHaveBeenCalledTimes(1);
      expect(newWebSocketRpcSession).toHaveBeenCalledTimes(1);
      expect(openLastUserPartitionStore).toHaveBeenCalledTimes(1);
      expect(getLastUserPartition).toHaveBeenCalledWith({
        database: locatorDatabases[0],
        key: locatorKey,
      });
      expect(setLastUserPartition).not.toHaveBeenCalled();
      expect(makeIdbSQLite3).toHaveBeenCalledWith({
        databaseName: 'replicas.db',
        mode: 'existing-only',
        vfsName: 'zerospin/056/sys_1/users/user_1',
        wasmUrl: 'https://worker.example/wa-sqlite-async.wasm',
      });
      expect(migrateUserReplicaDbAsync).toHaveBeenCalledWith({
        db: expect.anything(),
        mode: 'existing-only',
      });
      expect(
        request.generateSignature.mock.invocationCallOrder[0],
      ).toBeLessThan(openLastUserPartitionStore.mock.invocationCallOrder[0]);
      expect(
        openLastUserPartitionStore.mock.invocationCallOrder[0],
      ).toBeLessThan(getLastUserPartition.mock.invocationCallOrder[0]);
      expect(getLastUserPartition.mock.invocationCallOrder[0]).toBeLessThan(
        makeIdbSQLite3.mock.invocationCallOrder[0],
      );
      expect(
        Reflect.get(
          Reflect.get(acquired.api, 'props'),
          'getCurrentAuthenticatedApi',
        )(),
      ).toBeNull();

      systemApi[Symbol.dispose]();
      expect(locatorDatabases[0]?.close).toHaveBeenCalledTimes(1);
      channel.port1.close();
      channel.port2.close();
    },
  );

  it('rejects missing, corrupt, and epoch-invalid fallback state before opening a user partition', async () => {
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');

    const missingChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [missingChannel.port1] }));
    const missingSystemApi = systemApis.get(0);
    if (missingSystemApi === undefined) {
      throw new Error('missing-locator system api missing');
    }
    const missingRequest = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      }),
      {
        authenticationFailure: new ZerospinError({
          code: 'system-not-ready',
          message: 'System is not ready',
        }),
      },
    );
    await expect(
      Effect.runPromise(
        decodeRpc(await missingSystemApi.getUserPartitionRepo(missingRequest)),
      ),
    ).rejects.toThrow('offline-user-locator-unavailable');
    expect(getLastUserPartition).toHaveBeenCalledTimes(1);
    expect(makeIdbSQLite3).not.toHaveBeenCalled();
    expect(locatorDatabases[0]?.close).toHaveBeenCalledTimes(1);

    const corruptChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [corruptChannel.port1] }));
    const corruptSystemApi = systemApis.get(1);
    if (corruptSystemApi === undefined) {
      throw new Error('corrupt-locator system api missing');
    }
    const corruptRequest = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      }),
      {
        authenticationFailure: new ZerospinError({
          code: 'gateway-infrastructure-failure',
          message: 'Gateway is unavailable',
        }),
      },
    );
    getLastUserPartition.mockImplementationOnce(() =>
      Effect.fail(
        new ZerospinError({
          code: 'browser-persistence-reset-required',
          message: 'The locator is corrupt',
        }),
      ),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(await corruptSystemApi.getUserPartitionRepo(corruptRequest)),
      ),
    ).rejects.toThrow('browser-persistence-reset-required');
    expect(makeIdbSQLite3).not.toHaveBeenCalled();
    expect(locatorDatabases[1]?.close).toHaveBeenCalledTimes(1);

    const epochChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [epochChannel.port1] }));
    const epochSystemApi = systemApis.get(2);
    if (epochSystemApi === undefined) {
      throw new Error('epoch system api missing');
    }
    const epochRequest = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      }),
    );
    openLastUserPartitionStore.mockImplementationOnce(() =>
      Effect.fail(
        new ZerospinError({
          code: 'browser-persistence-reset-required',
          message: 'The persistence epoch is incompatible',
        }),
      ),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(await epochSystemApi.getUserPartitionRepo(epochRequest)),
      ),
    ).rejects.toThrow('browser-persistence-reset-required');
    expect(getLastUserPartition).toHaveBeenCalledTimes(2);
    expect(makeIdbSQLite3).not.toHaveBeenCalled();

    missingSystemApi[Symbol.dispose]();
    corruptSystemApi[Symbol.dispose]();
    epochSystemApi[Symbol.dispose]();
    missingChannel.port1.close();
    missingChannel.port2.close();
    corruptChannel.port1.close();
    corruptChannel.port2.close();
    epochChannel.port1.close();
    epochChannel.port2.close();
  });

  it('closes an unpublished user root when its required locator write fails', async () => {
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const request = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      }),
    );
    setLastUserPartition.mockImplementationOnce(() =>
      Effect.fail(
        new ZerospinError({
          code: 'set-last-user-partition-failed',
          message: 'The locator write failed',
        }),
      ),
    );

    await expect(
      Effect.runPromise(
        decodeRpc(await systemApi.getUserPartitionRepo(request)),
      ),
    ).rejects.toThrow('set-last-user-partition-failed');
    const unpublishedUserReplicaSqlite = makeIdbSQLite3.mock.results[0]?.value;
    const openedUserReplicaSqlite = await unpublishedUserReplicaSqlite;
    expect(openedUserReplicaSqlite.sqlite3.close).toHaveBeenCalledWith(
      openedUserReplicaSqlite.db,
    );
    expect(openedUserReplicaSqlite.vfs.close).toHaveBeenCalledTimes(1);
    expect(openedUserReplicaSqlite.vfs.xDelete).not.toHaveBeenCalled();
    expect(
      newWebSocketRpcSession.mock.results[0]?.value[Symbol.dispose],
    ).toHaveBeenCalledTimes(1);
    expect(locatorDatabases[0]?.close).toHaveBeenCalledTimes(1);

    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('fences a late locator write after port release and never publishes its user root', async () => {
    const locatorWrite = Promise.withResolvers<void>();
    const locatorWriteEntered = Promise.withResolvers<void>();
    setLastUserPartition.mockImplementationOnce(() =>
      Effect.promise(async () => {
        locatorWriteEntered.resolve();
        await locatorWrite.promise;
      }),
    );
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const opening = systemApi
      .getUserPartitionRepo(
        makePartitionRequest(
          makeAuthenticatedApi({
            systemId: aggregateState.systemId,
            userId: aggregateState.userId,
          }),
        ),
      )
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await locatorWriteEntered.promise;
    const openedUserReplicaSqlite = await makeIdbSQLite3.mock.results[0]?.value;

    systemApi[Symbol.dispose]();
    locatorWrite.resolve();

    await expect(opening).rejects.toThrow('shared-worker-port-released');
    expect(openedUserReplicaSqlite.sqlite3.close).toHaveBeenCalledWith(
      openedUserReplicaSqlite.db,
    );
    expect(openedUserReplicaSqlite.vfs.close).toHaveBeenCalledTimes(1);
    expect(openedUserReplicaSqlite.vfs.xDelete).not.toHaveBeenCalled();
    expect(locatorDatabases[0]?.close).toHaveBeenCalledTimes(1);
    channel.port1.close();
    channel.port2.close();
  });

  it('makes authentication configuration rebinding terminal for the port and every published capability', async () => {
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const initialRequest = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      }),
    );
    const acquired = await Effect.runPromise(
      decodeRpc(await systemApi.getUserPartitionRepo(initialRequest)),
    );
    const reboundRequest = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      }),
    );
    reboundRequest.systemName = 'another-system';

    await expect(
      Effect.runPromise(
        decodeRpc(await systemApi.getUserPartitionRepo(reboundRequest)),
      ),
    ).rejects.toThrow(
      'shared-worker-port-authentication-configuration-mismatch',
    );
    expect(reboundRequest.generateSignature).not.toHaveBeenCalled();
    expect(newWebSocketRpcSession).toHaveBeenCalledTimes(1);
    expect(
      newWebSocketRpcSession.mock.results[0]?.value[Symbol.dispose],
    ).toHaveBeenCalledTimes(1);
    await expect(
      Effect.runPromise(
        decodeRpc(await acquired.api.listServiceFrontendReplicas()),
      ),
    ).rejects.toThrow(
      'shared-worker-port-authentication-configuration-mismatch',
    );

    systemApi[Symbol.dispose]();
    expect(
      newWebSocketRpcSession.mock.results[0]?.value[Symbol.dispose],
    ).toHaveBeenCalledTimes(1);
    channel.port1.close();
    channel.port2.close();
  });

  it('rejects authenticated system-name mismatch and signature failure before consulting persistence', async () => {
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const mismatchedChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [mismatchedChannel.port1] }));
    const mismatchedSystemApi = systemApis.get(0);
    if (mismatchedSystemApi === undefined) {
      throw new Error('mismatched system api missing');
    }
    const mismatchedRequest = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      }),
      { systemName: 'another-system' },
    );

    await expect(
      Effect.runPromise(
        decodeRpc(
          await mismatchedSystemApi.getUserPartitionRepo(mismatchedRequest),
        ),
      ),
    ).rejects.toThrow('shared-worker-authenticated-user-identity-mismatch');
    expect(mismatchedRequest.generateSignature).toHaveBeenCalledTimes(1);
    expect(
      newWebSocketRpcSession.mock.results[0]?.value[Symbol.dispose],
    ).toHaveBeenCalledTimes(1);
    expect(openLastUserPartitionStore).not.toHaveBeenCalled();
    expect(getLastUserPartition).not.toHaveBeenCalled();
    expect(makeIdbSQLite3).not.toHaveBeenCalled();

    const signatureChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [signatureChannel.port1] }));
    const signatureSystemApi = systemApis.get(1);
    if (signatureSystemApi === undefined) {
      throw new Error('signature system api missing');
    }
    const signatureRequest = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      }),
    );
    const signatureFailure = new ZerospinError({
      code: 'authentication-signature-test-failed',
      message: 'The page signature capability failed',
    });
    signatureRequest.generateSignature.mockImplementationOnce(async () =>
      encodeLeft(signatureFailure),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await signatureSystemApi.getUserPartitionRepo(signatureRequest),
        ),
      ),
    ).rejects.toThrow('authentication-signature-test-failed');
    expect(newWebSocketRpcSession).toHaveBeenCalledTimes(1);
    expect(openLastUserPartitionStore).not.toHaveBeenCalled();
    expect(getLastUserPartition).not.toHaveBeenCalled();
    expect(makeIdbSQLite3).not.toHaveBeenCalled();

    mismatchedSystemApi[Symbol.dispose]();
    signatureSystemApi[Symbol.dispose]();
    mismatchedChannel.port1.close();
    mismatchedChannel.port2.close();
    signatureChannel.port1.close();
    signatureChannel.port2.close();
  });

  it('rejects every caller sharing a late root authentication result after its port is disposed', async () => {
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const authenticationBarrier = Promise.withResolvers<void>();
    const request = makePartitionRequest(
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
      }),
      { authenticationBarrier: authenticationBarrier.promise },
    );

    const firstOpening = systemApi
      .getUserPartitionRepo(request)
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    const secondOpening = systemApi
      .getUserPartitionRepo(request)
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await vi.waitFor(() =>
      expect(newWebSocketRpcSession).toHaveBeenCalledTimes(1),
    );
    expect(request.generateSignature).toHaveBeenCalledTimes(1);
    systemApi[Symbol.dispose]();
    authenticationBarrier.resolve();

    await expect(firstOpening).rejects.toThrow('shared-worker-port-released');
    await expect(secondOpening).rejects.toThrow('shared-worker-port-released');
    expect(
      newWebSocketRpcSession.mock.results[0]?.value[Symbol.dispose],
    ).toHaveBeenCalledTimes(1);
    expect(makeIdbSQLite3).not.toHaveBeenCalled();
    channel.port1.close();
    channel.port2.close();
  });

  it('disposes late aggregate and service admissions after their owning ports release without publishing replica state', async () => {
    const aggregateAdmission = Promise.withResolvers<void>();
    const aggregateAdmissionEntered = Promise.withResolvers<void>();
    const aggregateFrontendApi = makeAggregateFrontendApi({
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-released-aggregate-admission' }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    });
    const aggregateSinkDisposed = vi.fn();
    const aggregateSinkTarget = new (class extends RpcTarget {
      async handleBlock() {
        return encodeRight(undefined);
      }

      async replaceState() {
        return encodeRight(undefined);
      }

      async handleFailure() {
        return encodeRight(undefined);
      }

      [Symbol.dispose]() {
        aggregateSinkDisposed();
      }
    })();
    const aggregateSink = new RpcStub(aggregateSinkTarget);
    const aggregateRequestSink = aggregateSink.dup();

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const aggregateChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [aggregateChannel.port1] }));
    const aggregateSystemApi = systemApis.get(0);
    if (aggregateSystemApi === undefined) {
      throw new Error('aggregate system api missing');
    }
    const aggregateUserReplicaApi = await openUserPartition(
      aggregateSystemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi,
        aggregateAdmission: {
          entered: () => aggregateAdmissionEntered.resolve(),
          barrier: aggregateAdmission.promise,
        },
      }),
    );
    const aggregateOpening = aggregateUserReplicaApi
      .acquireAggregateFrontendReplica({
        aggregateId: aggregateState.aggregateId,
        aggregateName: aggregateState.aggregateName,
        frontendName: aggregateState.frontendName,
        aggregateFrontendLockKey,
        aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
        frontendSpec: aggregateFrontendSpec,
        mode: 'online',
        sink: aggregateRequestSink,
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await aggregateAdmissionEntered.promise;

    aggregateSystemApi[Symbol.dispose]();
    aggregateSink[Symbol.dispose]();
    aggregateChannel.port1.close();
    aggregateChannel.port2.close();
    aggregateAdmission.resolve();

    await expect(aggregateOpening).rejects.toThrow(
      'aggregate-frontend-registration-authorization-stale',
    );
    aggregateRequestSink[Symbol.dispose]();
    expect(aggregateFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    expect(aggregateSinkDisposed).toHaveBeenCalledOnce();
    expect(
      Reflect.get(
        Reflect.get(aggregateUserReplicaApi, 'props'),
        'aggregateReplicaRuntimes',
      ),
    ).toEqual(new Map());

    const serviceAdmission = Promise.withResolvers<void>();
    const serviceAdmissionEntered = Promise.withResolvers<void>();
    const serviceFrontendApi = makeServiceFrontendApi({
      getState: vi.fn(async () => encodeRight(serviceState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-released-service-admission' }),
      ),
    });
    const serviceSinkDisposed = vi.fn();
    const serviceSinkTarget = new (class extends RpcTarget {
      async handleBlock() {
        return encodeRight(undefined);
      }

      async replaceState() {
        return encodeRight(undefined);
      }

      async handleFailure() {
        return encodeRight(undefined);
      }

      [Symbol.dispose]() {
        serviceSinkDisposed();
      }
    })();
    const serviceSink = new RpcStub(serviceSinkTarget);
    const serviceRequestSink = serviceSink.dup();
    const serviceChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [serviceChannel.port1] }));
    const serviceSystemApi = systemApis.get(1);
    if (serviceSystemApi === undefined) {
      throw new Error('service system api missing');
    }
    const serviceUserReplicaApi = await openUserPartition(
      serviceSystemApi,
      makeAuthenticatedApi({
        systemId: serviceState.systemId,
        userId: serviceState.userId,
        serviceFrontendApi,
        serviceAdmission: {
          entered: () => serviceAdmissionEntered.resolve(),
          barrier: serviceAdmission.promise,
        },
      }),
    );
    const serviceOpening = serviceUserReplicaApi
      .acquireServiceFrontendReplica({
        serviceName: serviceFrontend.serviceName,
        frontendName: serviceFrontend.frontendName,
        serviceFrontendLockKey,
        serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
        frontendSpec: serviceFrontendSpec,
        mode: 'online',
        sink: serviceRequestSink,
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await serviceAdmissionEntered.promise;

    serviceSystemApi[Symbol.dispose]();
    serviceSink[Symbol.dispose]();
    serviceChannel.port1.close();
    serviceChannel.port2.close();
    serviceAdmission.resolve();

    await expect(serviceOpening).rejects.toThrow(
      'service-frontend-registration-authorization-stale',
    );
    serviceRequestSink[Symbol.dispose]();
    expect(serviceFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    expect(serviceSinkDisposed).toHaveBeenCalledOnce();
    expect(
      Reflect.get(
        Reflect.get(serviceUserReplicaApi, 'props'),
        'serviceReplicaRuntimes',
      ),
    ).toEqual(new Map());
    const unpublishedDatabaseKeys = [...databaseClients.keys()].filter(
      databaseKey =>
        databaseKey.includes('/aggregate/') ||
        databaseKey.includes('/service/'),
    );
    expect(unpublishedDatabaseKeys).toHaveLength(2);
    expect(
      unpublishedDatabaseKeys.filter(databaseKey =>
        databaseKey.includes('/aggregate/'),
      ),
    ).toHaveLength(1);
    expect(
      unpublishedDatabaseKeys.filter(databaseKey =>
        databaseKey.includes('/service/'),
      ),
    ).toHaveLength(1);
  });

  it('rejects aggregate and service children when their parent changes during admission', async () => {
    const aggregateAdmission = Promise.withResolvers<void>();
    const aggregateAdmissionEntered = Promise.withResolvers<void>();
    const serviceAdmission = Promise.withResolvers<void>();
    const serviceAdmissionEntered = Promise.withResolvers<void>();
    const aggregateFrontendApi = makeAggregateFrontendApi({
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-stale-aggregate-admission' }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    });
    const serviceFrontendApi = makeServiceFrontendApi({
      getState: vi.fn(async () => encodeRight(serviceState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-stale-service-admission' }),
      ),
    });
    const authenticatedApi = makeAuthenticatedApi({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      aggregateFrontendApi,
      aggregateAdmission: {
        entered: () => aggregateAdmissionEntered.resolve(),
        barrier: aggregateAdmission.promise,
      },
      serviceFrontendApi,
      serviceAdmission: {
        entered: () => serviceAdmissionEntered.resolve(),
        barrier: serviceAdmission.promise,
      },
    });

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(systemApi, authenticatedApi);
    const getAuthenticatedApi = Reflect.get(
      Reflect.get(userReplicaApi, 'props'),
      'getAuthenticatedApi',
    );
    const getCurrentAuthenticatedApi = Reflect.get(
      Reflect.get(userReplicaApi, 'props'),
      'getCurrentAuthenticatedApi',
    );
    if (
      typeof getAuthenticatedApi !== 'function' ||
      typeof getCurrentAuthenticatedApi !== 'function'
    ) {
      throw new Error('bound root acquisition missing');
    }

    const aggregateOpening = userReplicaApi
      .acquireAggregateFrontendReplica({
        aggregateId: aggregateState.aggregateId,
        aggregateName: aggregateState.aggregateName,
        frontendName: aggregateState.frontendName,
        aggregateFrontendLockKey,
        aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
        frontendSpec: aggregateFrontendSpec,
        mode: 'online',
        sink: makeAggregateSink(),
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await aggregateAdmissionEntered.promise;
    const aggregateParent = getCurrentAuthenticatedApi();
    if (aggregateParent === null) {
      throw new Error('aggregate admission parent missing');
    }
    const aggregateReplacement = await getAuthenticatedApi({
      freshness: 'force',
      failedAuthenticatedApi: aggregateParent,
    });
    const aggregateReplacementParent = Reflect.get(
      aggregateReplacement,
      'authenticatedApi',
    );
    expect(aggregateReplacementParent).not.toBe(aggregateParent);
    expect(getCurrentAuthenticatedApi()).toBe(aggregateReplacementParent);
    aggregateAdmission.resolve();
    await expect(aggregateOpening).rejects.toThrow(
      'aggregate-frontend-registration-authorization-stale',
    );
    expect(aggregateFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();

    const serviceOpening = userReplicaApi
      .acquireServiceFrontendReplica({
        serviceName: serviceFrontend.serviceName,
        frontendName: serviceFrontend.frontendName,
        serviceFrontendLockKey,
        serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
        frontendSpec: serviceFrontendSpec,
        mode: 'online',
        sink: makeServiceSink(),
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await serviceAdmissionEntered.promise;
    const serviceParent = getCurrentAuthenticatedApi();
    if (serviceParent === null) {
      throw new Error('service admission parent missing');
    }
    const serviceReplacement = await getAuthenticatedApi({
      freshness: 'force',
      failedAuthenticatedApi: serviceParent,
    });
    const serviceReplacementParent = Reflect.get(
      serviceReplacement,
      'authenticatedApi',
    );
    expect(serviceReplacementParent).not.toBe(serviceParent);
    expect(getCurrentAuthenticatedApi()).toBe(serviceReplacementParent);
    serviceAdmission.resolve();
    await expect(serviceOpening).rejects.toThrow(
      'service-frontend-registration-authorization-stale',
    );
    expect(serviceFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    const staleAdmissionDatabaseKeys = [...databaseClients.keys()].filter(
      databaseKey =>
        databaseKey.includes('/aggregate/') ||
        databaseKey.includes('/service/'),
    );
    expect(staleAdmissionDatabaseKeys).toHaveLength(2);
    expect(
      staleAdmissionDatabaseKeys.filter(databaseKey =>
        databaseKey.includes('/aggregate/'),
      ),
    ).toHaveLength(1);
    expect(
      staleAdmissionDatabaseKeys.filter(databaseKey =>
        databaseKey.includes('/service/'),
      ),
    ).toHaveLength(1);

    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('refreshes one Repo-owned authority and reuses the current parent for a stale sibling Repo', async () => {
    const aggregateFrontendApi = makeAggregateFrontendApi({
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-same-port-aggregate' }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    });
    const serviceFrontendApi = makeServiceFrontendApi({
      getState: vi.fn(async () => encodeRight(serviceState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-same-port-service' }),
      ),
    });
    const authenticatedApi = makeAuthenticatedApi({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      aggregateFrontendApi,
      serviceFrontendApi,
    });

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const request = makePartitionRequest(authenticatedApi);
    const userPartition = await Effect.runPromise(
      decodeRpc(await systemApi.getUserPartitionRepo(request)),
    );
    const userReplicaApi = userPartition.api;
    const aggregateAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink: makeAggregateSink(),
        }),
      ),
    );
    const serviceAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireServiceFrontendReplica({
          serviceName: serviceFrontend.serviceName,
          frontendName: serviceFrontend.frontendName,
          serviceFrontendLockKey,
          serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
          frontendSpec: serviceFrontendSpec,
          mode: 'online',
          sink: makeServiceSink(),
        }),
      ),
    );
    const aggregateReplicaRuntime = Reflect.get(
      Reflect.get(aggregateAcquisition, 'props'),
      'replicaRuntime',
    );
    const serviceReplicaRuntime = Reflect.get(
      Reflect.get(serviceAcquisition, 'props'),
      'replicaRuntime',
    );
    const firstAggregateAuthority = Reflect.get(
      aggregateReplicaRuntime,
      'installedAuthority',
    );
    const firstServiceAuthority = Reflect.get(
      serviceReplicaRuntime,
      'installedAuthority',
    );
    if (
      firstAggregateAuthority === null ||
      typeof firstAggregateAuthority !== 'object' ||
      firstServiceAuthority === null ||
      typeof firstServiceAuthority !== 'object'
    ) {
      throw new Error('same-port sibling authorities missing');
    }
    const firstParent = Reflect.get(
      firstAggregateAuthority,
      'authenticatedApi',
    );
    expect(firstParent).not.toBeNull();
    expect(Reflect.get(firstServiceAuthority, 'authenticatedApi')).toBe(
      firstParent,
    );
    const firstAggregateFrontendApi = Reflect.get(
      firstAggregateAuthority,
      'frontendApi',
    );
    const firstServiceFrontendApi = Reflect.get(
      firstServiceAuthority,
      'frontendApi',
    );
    await aggregateReplicaRuntime.repairFromRegistration({
      refreshAuthority: true,
      replaceState: false,
    });
    const replacementAggregateAuthority = Reflect.get(
      aggregateReplicaRuntime,
      'installedAuthority',
    );
    if (
      replacementAggregateAuthority === null ||
      typeof replacementAggregateAuthority !== 'object'
    ) {
      throw new Error('replacement aggregate authority missing');
    }
    const replacementParent = Reflect.get(
      replacementAggregateAuthority,
      'authenticatedApi',
    );
    expect(replacementParent).not.toBe(firstParent);
    expect(replacementAggregateAuthority).not.toBe(firstAggregateAuthority);
    expect(Reflect.get(replacementAggregateAuthority, 'frontendApi')).not.toBe(
      firstAggregateFrontendApi,
    );
    expect(firstAggregateFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    expect(request.generateSignature).toHaveBeenCalledTimes(2);
    expect(newWebSocketRpcSession).toHaveBeenCalledTimes(2);

    await serviceReplicaRuntime.repairFromRegistration({
      failedAuthority: firstServiceAuthority,
      authorityFailure: new Error('stale same-port sibling authority'),
      replaceState: false,
    });
    const replacementServiceAuthority = Reflect.get(
      serviceReplicaRuntime,
      'installedAuthority',
    );
    if (
      replacementServiceAuthority === null ||
      typeof replacementServiceAuthority !== 'object'
    ) {
      throw new Error('replacement service authority missing');
    }
    expect(Reflect.get(replacementServiceAuthority, 'authenticatedApi')).toBe(
      replacementParent,
    );
    expect(replacementServiceAuthority).not.toBe(firstServiceAuthority);
    expect(Reflect.get(replacementServiceAuthority, 'frontendApi')).not.toBe(
      firstServiceFrontendApi,
    );
    expect(firstServiceFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    expect(request.generateSignature).toHaveBeenCalledTimes(2);
    expect(newWebSocketRpcSession).toHaveBeenCalledTimes(2);
    expect(authenticatedApi.getAggregateFrontendApi).toHaveBeenCalledTimes(2);
    expect(authenticatedApi.getServiceFrontendApi).toHaveBeenCalledTimes(2);

    await Effect.runPromise(decodeRpc(await aggregateAcquisition.release()));
    await Effect.runPromise(decodeRpc(await serviceAcquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('disposes rejected aggregate and service children without publishing exact replica state', async () => {
    const aggregateAuthority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-rejected-child' }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const serviceAuthority = {
      getState: vi.fn(async () => encodeRight(serviceState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-rejected-service-child' }),
      ),
    };
    const mismatchedAggregateChild =
      makeAggregateFrontendApi(aggregateAuthority);
    const mismatchedServiceChild = makeServiceFrontendApi(serviceAuthority);
    const rejectedAggregateChild = makeAggregateFrontendApi(aggregateAuthority);
    const rejectedServiceChild = makeServiceFrontendApi(serviceAuthority);
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');

    const mismatchChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [mismatchChannel.port1] }));
    const mismatchSystemApi = systemApis.get(0);
    if (mismatchSystemApi === undefined) {
      throw new Error('mismatch system api missing');
    }
    const mismatchPartition = await openUserPartition(
      mismatchSystemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: mismatchedAggregateChild,
        aggregateAdmissionSystemId: 'sys_other',
        serviceFrontendApi: mismatchedServiceChild,
        serviceAdmissionUserId: 'user_other',
      }),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await mismatchPartition.acquireAggregateFrontendReplica({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
            aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
            frontendSpec: aggregateFrontendSpec,
            mode: 'online',
            sink: makeAggregateSink(),
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-frontend-admission-target-mismatch');
    await expect(
      Effect.runPromise(
        decodeRpc(
          await mismatchPartition.acquireServiceFrontendReplica({
            serviceName: serviceFrontend.serviceName,
            frontendName: serviceFrontend.frontendName,
            serviceFrontendLockKey,
            serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
            frontendSpec: serviceFrontendSpec,
            mode: 'online',
            sink: makeServiceSink(),
          }),
        ),
      ),
    ).rejects.toThrow('service-frontend-admission-target-mismatch');
    expect(mismatchedAggregateChild[Symbol.dispose]).toHaveBeenCalledTimes(1);
    expect(mismatchedServiceChild[Symbol.dispose]).toHaveBeenCalledTimes(1);

    const rejectedChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [rejectedChannel.port1] }));
    const rejectedSystemApi = systemApis.get(1);
    if (rejectedSystemApi === undefined) {
      throw new Error('rejected system api missing');
    }
    const rejectedPartition = await openUserPartition(
      rejectedSystemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: rejectedAggregateChild,
        aggregateAdmissionFailure: new ZerospinError({
          code: 'aggregate-authorization-required',
          message: 'The authenticated user does not own this aggregate',
        }),
        serviceFrontendApi: rejectedServiceChild,
        serviceAdmissionFailure: new ZerospinError({
          code: 'service-authorization-required',
          message: 'The authenticated user cannot read this service',
        }),
      }),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await rejectedPartition.acquireAggregateFrontendReplica({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
            aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
            frontendSpec: aggregateFrontendSpec,
            mode: 'online',
            sink: makeAggregateSink(),
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-authorization-required');
    await expect(
      Effect.runPromise(
        decodeRpc(
          await rejectedPartition.acquireServiceFrontendReplica({
            serviceName: serviceFrontend.serviceName,
            frontendName: serviceFrontend.frontendName,
            serviceFrontendLockKey,
            serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
            frontendSpec: serviceFrontendSpec,
            mode: 'online',
            sink: makeServiceSink(),
          }),
        ),
      ),
    ).rejects.toThrow('service-authorization-required');
    expect(rejectedAggregateChild[Symbol.dispose]).toHaveBeenCalledTimes(1);
    expect(rejectedServiceChild[Symbol.dispose]).toHaveBeenCalledTimes(1);
    await expect(
      Effect.runPromise(
        decodeRpc(await mismatchPartition.listAggregateFrontendReplicas()),
      ),
    ).resolves.toEqual([]);
    await expect(
      Effect.runPromise(
        decodeRpc(await mismatchPartition.listServiceFrontendReplicas()),
      ),
    ).resolves.toEqual([]);
    const rejectedDatabaseKeys = [...databaseClients.keys()].filter(
      databaseKey =>
        databaseKey.includes('/aggregate/') ||
        databaseKey.includes('/service/'),
    );
    expect(rejectedDatabaseKeys).toHaveLength(4);
    expect(
      rejectedDatabaseKeys.filter(databaseKey =>
        databaseKey.includes('/aggregate/'),
      ),
    ).toHaveLength(2);
    expect(
      rejectedDatabaseKeys.filter(databaseKey =>
        databaseKey.includes('/service/'),
      ),
    ).toHaveLength(2);

    mismatchSystemApi[Symbol.dispose]();
    rejectedSystemApi[Symbol.dispose]();
    mismatchChannel.port1.close();
    mismatchChannel.port2.close();
    rejectedChannel.port1.close();
    rejectedChannel.port2.close();
  });

  it('disposes aggregate and service children whose admitted lock cannot be normalized without publishing exact replica state', async () => {
    const aggregateFrontendApi = makeAggregateFrontendApi({
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-malformed-aggregate-admission' }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    });
    const serviceFrontendApi = makeServiceFrontendApi({
      getState: vi.fn(async () => encodeRight(serviceState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-malformed-service-admission' }),
      ),
    });
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi,
        aggregateAdmissionMalformed: true,
        serviceFrontendApi,
        serviceAdmissionMalformed: true,
      }),
    );

    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.acquireAggregateFrontendReplica({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
            aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
            frontendSpec: aggregateFrontendSpec,
            mode: 'online',
            sink: makeAggregateSink(),
          }),
        ),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.acquireServiceFrontendReplica({
            serviceName: serviceFrontend.serviceName,
            frontendName: serviceFrontend.frontendName,
            serviceFrontendLockKey,
            serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
            frontendSpec: serviceFrontendSpec,
            mode: 'online',
            sink: makeServiceSink(),
          }),
        ),
      ),
    ).rejects.toThrow();

    expect(aggregateFrontendApi[Symbol.dispose]).toHaveBeenCalledTimes(1);
    expect(serviceFrontendApi[Symbol.dispose]).toHaveBeenCalledTimes(1);
    await expect(
      Effect.runPromise(
        decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
      ),
    ).resolves.toEqual([]);
    await expect(
      Effect.runPromise(
        decodeRpc(await userReplicaApi.listServiceFrontendReplicas()),
      ),
    ).resolves.toEqual([]);
    const malformedAdmissionDatabaseKeys = [...databaseClients.keys()].filter(
      databaseKey =>
        databaseKey.includes('/aggregate/') ||
        databaseKey.includes('/service/'),
    );
    expect(malformedAdmissionDatabaseKeys).toHaveLength(2);
    expect(
      malformedAdmissionDatabaseKeys.filter(databaseKey =>
        databaseKey.includes('/aggregate/'),
      ),
    ).toHaveLength(1);
    expect(
      malformedAdmissionDatabaseKeys.filter(databaseKey =>
        databaseKey.includes('/service/'),
      ),
    ).toHaveLength(1);

    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('rolls back authority-derived aggregate and service metadata when the parent turns over during its initial write', async () => {
    const aggregateFrontendApi = makeAggregateFrontendApi({
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-stale-aggregate-metadata' }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    });
    const serviceFrontendApi = makeServiceFrontendApi({
      getState: vi.fn(async () => encodeRight(serviceState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-stale-service-metadata' }),
      ),
    });
    const authenticatedApi = makeAuthenticatedApi({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      aggregateFrontendApi,
      serviceFrontendApi,
    });
    makeTxAsync.mockImplementation(props =>
      Effect.gen(function* () {
        const client = Reflect.get(props.db, '$client');
        client.run('BEGIN');
        return yield* props.program({ tx: props.db }).pipe(
          Effect.onExit(exit =>
            Effect.sync(() => {
              client.run(Exit.isSuccess(exit) ? 'COMMIT' : 'ROLLBACK');
            }),
          ),
        );
      }),
    );

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(systemApi, authenticatedApi);
    const getAuthenticatedApi = Reflect.get(
      Reflect.get(userReplicaApi, 'props'),
      'getAuthenticatedApi',
    );
    const getCurrentAuthenticatedApi = Reflect.get(
      Reflect.get(userReplicaApi, 'props'),
      'getCurrentAuthenticatedApi',
    );
    if (
      typeof getAuthenticatedApi !== 'function' ||
      typeof getCurrentAuthenticatedApi !== 'function'
    ) {
      throw new Error('bound root acquisition missing');
    }

    const aggregateMetadataWrite = Promise.withResolvers<void>();
    const aggregateMetadataWriteEntered = Promise.withResolvers<void>();
    databaseStatementBarriers.set(
      'insert into "aggregateFrontendReplicaMetadata"',
      {
        entered: () => aggregateMetadataWriteEntered.resolve(),
        barrier: aggregateMetadataWrite.promise,
      },
    );
    const aggregateOpening = userReplicaApi
      .acquireAggregateFrontendReplica({
        aggregateId: aggregateState.aggregateId,
        aggregateName: aggregateState.aggregateName,
        frontendName: aggregateState.frontendName,
        aggregateFrontendLockKey,
        aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
        frontendSpec: aggregateFrontendSpec,
        mode: 'online',
        sink: makeAggregateSink(),
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await aggregateMetadataWriteEntered.promise;
    const aggregateDatabaseEntry = [...databaseClients.entries()].find(
      ([databaseKey]) => databaseKey.includes('/aggregate/'),
    );
    if (aggregateDatabaseEntry === undefined) {
      throw new Error('aggregate replica database missing');
    }
    const [aggregateDatabaseKey, aggregateDatabase] = aggregateDatabaseEntry;
    const aggregateParent = getCurrentAuthenticatedApi();
    if (aggregateParent === null) {
      throw new Error('aggregate metadata parent missing');
    }
    const aggregateReplacement = await getAuthenticatedApi({
      freshness: 'force',
      failedAuthenticatedApi: aggregateParent,
    });
    expect(Reflect.get(aggregateReplacement, 'authenticatedApi')).not.toBe(
      aggregateParent,
    );
    aggregateMetadataWrite.resolve();

    await expect(aggregateOpening).rejects.toThrow(
      'acquire-aggregate-frontend-replica-failed',
    );
    expect(
      aggregateDatabase.exec(
        'SELECT COUNT(*) FROM aggregateFrontendReplicaMetadata',
      )[0]?.values,
    ).toEqual([[0]]);
    expect(databaseClients.has(aggregateDatabaseKey)).toBe(true);
    expect(
      Reflect.get(aggregateDatabase, 'sqlite3').close,
    ).toHaveBeenCalledOnce();
    expect(
      Reflect.get(aggregateDatabase, 'vfs').xDelete,
    ).not.toHaveBeenCalled();
    expect(Reflect.get(aggregateDatabase, 'vfs').close).toHaveBeenCalledOnce();
    expect(aggregateFrontendApi[Symbol.dispose]).toHaveBeenCalledTimes(1);

    const serviceMetadataWrite = Promise.withResolvers<void>();
    const serviceMetadataWriteEntered = Promise.withResolvers<void>();
    databaseStatementBarriers.set(
      'insert into "serviceFrontendReplicaMetadata"',
      {
        entered: () => serviceMetadataWriteEntered.resolve(),
        barrier: serviceMetadataWrite.promise,
      },
    );
    const serviceOpening = userReplicaApi
      .acquireServiceFrontendReplica({
        serviceName: serviceFrontend.serviceName,
        frontendName: serviceFrontend.frontendName,
        serviceFrontendLockKey,
        serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
        frontendSpec: serviceFrontendSpec,
        mode: 'online',
        sink: makeServiceSink(),
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await serviceMetadataWriteEntered.promise;
    const serviceDatabaseEntry = [...databaseClients.entries()].find(
      ([databaseKey]) => databaseKey.includes('/service/'),
    );
    if (serviceDatabaseEntry === undefined) {
      throw new Error('service replica database missing');
    }
    const [serviceDatabaseKey, serviceDatabase] = serviceDatabaseEntry;
    const serviceParent = getCurrentAuthenticatedApi();
    if (serviceParent === null) {
      throw new Error('service metadata parent missing');
    }
    const serviceReplacement = await getAuthenticatedApi({
      freshness: 'force',
      failedAuthenticatedApi: serviceParent,
    });
    expect(Reflect.get(serviceReplacement, 'authenticatedApi')).not.toBe(
      serviceParent,
    );
    serviceMetadataWrite.resolve();

    await expect(serviceOpening).rejects.toThrow(
      'service-frontend-replica-repair-failed',
    );
    expect(
      serviceDatabase.exec(
        'SELECT COUNT(*) FROM serviceFrontendReplicaMetadata',
      )[0]?.values,
    ).toEqual([[0]]);
    expect(databaseClients.has(serviceDatabaseKey)).toBe(true);
    expect(
      Reflect.get(serviceDatabase, 'sqlite3').close,
    ).toHaveBeenCalledOnce();
    expect(Reflect.get(serviceDatabase, 'vfs').xDelete).not.toHaveBeenCalled();
    expect(Reflect.get(serviceDatabase, 'vfs').close).toHaveBeenCalledOnce();
    expect(serviceFrontendApi[Symbol.dispose]).toHaveBeenCalledTimes(1);

    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('does not map failed initial aggregate or service activation and retries each under the current parent', async () => {
    const aggregateFrontendApi = makeAggregateFrontendApi({
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-retried-aggregate-activation' }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    });
    const serviceFrontendApi = makeServiceFrontendApi({
      getState: vi.fn(async () => encodeRight(serviceState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-retried-service-activation' }),
      ),
    });
    const authenticatedApi = makeAuthenticatedApi({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      aggregateFrontendApi,
      serviceFrontendApi,
    });
    makeTxAsync.mockImplementation(props =>
      Effect.gen(function* () {
        const client = Reflect.get(props.db, '$client');
        client.run('BEGIN');
        return yield* props.program({ tx: props.db }).pipe(
          Effect.onExit(exit =>
            Effect.sync(() => {
              client.run(Exit.isSuccess(exit) ? 'COMMIT' : 'ROLLBACK');
            }),
          ),
        );
      }),
    );

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(systemApi, authenticatedApi);
    const userReplicaProps = Reflect.get(userReplicaApi, 'props');
    const getAuthenticatedApi = Reflect.get(
      userReplicaProps,
      'getAuthenticatedApi',
    );
    const getCurrentAuthenticatedApi = Reflect.get(
      userReplicaProps,
      'getCurrentAuthenticatedApi',
    );
    const aggregateReplicaRuntimes = Reflect.get(
      userReplicaProps,
      'aggregateReplicaRuntimes',
    );
    const serviceReplicaRuntimes = Reflect.get(
      userReplicaProps,
      'serviceReplicaRuntimes',
    );
    if (
      typeof getAuthenticatedApi !== 'function' ||
      typeof getCurrentAuthenticatedApi !== 'function' ||
      !(aggregateReplicaRuntimes instanceof Map) ||
      !(serviceReplicaRuntimes instanceof Map)
    ) {
      throw new Error('bound root or replica runtime maps missing');
    }

    const aggregateActivationWrite = Promise.withResolvers<void>();
    const aggregateActivationWriteEntered = Promise.withResolvers<void>();
    databaseStatementBarriers.set(
      'insert into "aggregateFrontendReplicaMetadata"',
      {
        entered: () => aggregateActivationWriteEntered.resolve(),
        barrier: aggregateActivationWrite.promise,
      },
    );
    const aggregateOpening = userReplicaApi
      .acquireAggregateFrontendReplica({
        aggregateId: aggregateState.aggregateId,
        aggregateName: aggregateState.aggregateName,
        frontendName: aggregateState.frontendName,
        aggregateFrontendLockKey,
        aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
        frontendSpec: aggregateFrontendSpec,
        mode: 'online',
        sink: makeAggregateSink(),
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await aggregateActivationWriteEntered.promise;
    const firstParent = getCurrentAuthenticatedApi();
    if (firstParent === null) {
      throw new Error('aggregate activation parent missing');
    }
    const secondAuthentication = await getAuthenticatedApi({
      freshness: 'force',
      failedAuthenticatedApi: firstParent,
    });
    const secondParent = Reflect.get(secondAuthentication, 'authenticatedApi');
    expect(secondParent).not.toBe(firstParent);
    aggregateActivationWrite.resolve();

    await expect(aggregateOpening).rejects.toThrow(
      'acquire-aggregate-frontend-replica-failed',
    );
    expect(aggregateReplicaRuntimes).toEqual(new Map());
    expect(
      [...databaseClients.keys()].filter(databaseKey =>
        databaseKey.includes('/aggregate/'),
      ),
    ).toHaveLength(1);
    expect(aggregateFrontendApi[Symbol.dispose]).toHaveBeenCalledTimes(1);

    const aggregateRetry = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink: makeAggregateSink(),
        }),
      ),
    );
    await expect(
      Effect.runPromise(decodeRpc(await aggregateRetry.getState())),
    ).resolves.toMatchObject({
      aggregateId: aggregateState.aggregateId,
      frontendName: aggregateState.frontendName,
      aggregateFrontendLockKey,
      replicaIndex: 0,
    });
    expect(aggregateReplicaRuntimes.size).toBe(1);
    expect(getCurrentAuthenticatedApi()).toBe(secondParent);
    expect(aggregateFrontendApi[Symbol.dispose]).toHaveBeenCalledTimes(1);

    const serviceActivationWrite = Promise.withResolvers<void>();
    const serviceActivationWriteEntered = Promise.withResolvers<void>();
    databaseStatementBarriers.set(
      'insert into "serviceFrontendReplicaMetadata"',
      {
        entered: () => serviceActivationWriteEntered.resolve(),
        barrier: serviceActivationWrite.promise,
      },
    );
    const serviceOpening = userReplicaApi
      .acquireServiceFrontendReplica({
        serviceName: serviceFrontend.serviceName,
        frontendName: serviceFrontend.frontendName,
        serviceFrontendLockKey,
        serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
        frontendSpec: serviceFrontendSpec,
        mode: 'online',
        sink: makeServiceSink(),
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await serviceActivationWriteEntered.promise;
    const serviceParent = getCurrentAuthenticatedApi();
    if (serviceParent === null) {
      throw new Error('service activation parent missing');
    }
    expect(serviceParent).toBe(secondParent);
    const thirdAuthentication = await getAuthenticatedApi({
      freshness: 'force',
      failedAuthenticatedApi: serviceParent,
    });
    const thirdParent = Reflect.get(thirdAuthentication, 'authenticatedApi');
    expect(thirdParent).not.toBe(serviceParent);
    serviceActivationWrite.resolve();

    await expect(serviceOpening).rejects.toThrow(
      'service-frontend-replica-repair-failed',
    );
    expect(serviceReplicaRuntimes).toEqual(new Map());
    expect(
      [...databaseClients.keys()].filter(databaseKey =>
        databaseKey.includes('/service/'),
      ),
    ).toHaveLength(1);
    expect(serviceFrontendApi[Symbol.dispose]).toHaveBeenCalledTimes(1);

    const serviceRetry = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireServiceFrontendReplica({
          serviceName: serviceFrontend.serviceName,
          frontendName: serviceFrontend.frontendName,
          serviceFrontendLockKey,
          serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
          frontendSpec: serviceFrontendSpec,
          mode: 'online',
          sink: makeServiceSink(),
        }),
      ),
    );
    await expect(
      Effect.runPromise(decodeRpc(await serviceRetry.getState())),
    ).resolves.toMatchObject({
      serviceName: serviceFrontend.serviceName,
      frontendName: serviceFrontend.frontendName,
      serviceFrontendLockKey,
      replicaIndex: 0,
    });
    expect(serviceReplicaRuntimes.size).toBe(1);
    expect(getCurrentAuthenticatedApi()).toBe(thirdParent);
    expect(serviceFrontendApi[Symbol.dispose]).toHaveBeenCalledTimes(1);
    expect(newWebSocketRpcSession).toHaveBeenCalledTimes(3);

    await Effect.runPromise(decodeRpc(await aggregateRetry.release()));
    await Effect.runPromise(decodeRpc(await serviceRetry.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('deduplicates one same-target-lock replica and socket, fails over owners, and fully releases the last failed sink', async () => {
    const firstTicket = vi.fn(async () => {
      throw new Error('first capability closed');
    });
    const secondTicket = vi.fn(async () =>
      encodeRight({
        ticket: 'ticket-second',
      }),
    );
    const firstAuthority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: firstTicket,
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const secondAuthority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: secondTicket,
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const firstFrontendApi = makeAggregateFrontendApi(firstAuthority);
    const secondFrontendApi = makeAggregateFrontendApi(secondAuthority);
    const firstSink = makeAggregateSink();
    const secondSink = makeAggregateSink();

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: secondFrontendApi,
      }),
    );
    const secondChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [secondChannel.port1] }));
    const secondSystemApi = systemApis.get(1);
    if (secondSystemApi === undefined) {
      throw new Error('second system api missing');
    }
    const secondUserPartitionRepo = await openUserPartition(
      secondSystemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: firstFrontendApi,
      }),
      { systemVersions: ['1.0.0', '2.0.0'] },
    );

    const firstAcquisition = await Effect.runPromise(
      decodeRpc(
        await secondUserPartitionRepo.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink: firstSink,
        }),
      ),
    );
    const secondAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink: secondSink,
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));
    expect(firstTicket).toHaveBeenCalledTimes(2);
    expect(secondTicket).toHaveBeenCalledTimes(1);
    expect(newWebSocketRpcSession).toHaveBeenCalledTimes(4);
    expect(webSocketInstances[0]?.url).toContain('ticket=ticket-second');
    const ownedDiagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    expect(ownedDiagnostics).toMatchObject([{ activeRegistrationCount: 2 }]);

    await Effect.runPromise(decodeRpc(await firstAcquisition.release()));
    const independentlyOwnedDiagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    expect(independentlyOwnedDiagnostics).toMatchObject([
      {
        activeRegistrationCount: 1,
      },
    ]);
    expect(webSocketInstances).toHaveLength(1);
    await expect(
      Effect.runPromise(decodeRpc(await secondAcquisition.getState())),
    ).resolves.toMatchObject({ aggregateFrontendLockKey });
    await vi.advanceTimersByTimeAsync(0);
    secondSink.replaceState.mockResolvedValueOnce(
      encodeLeft(
        new ZerospinError({
          code: 'aggregate-sink-replacement-test-failed',
          message: 'Aggregate sink rejected its replacement state',
        }),
      ),
    );
    const secondReplicaRuntime = Reflect.get(
      Reflect.get(secondAcquisition, 'props'),
      'replicaRuntime',
    );
    if (
      secondReplicaRuntime === null ||
      typeof secondReplicaRuntime !== 'object' ||
      typeof Reflect.get(secondReplicaRuntime, 'fanoutReplacement') !==
        'function'
    ) {
      throw new Error('aggregate replica runtime missing');
    }
    await secondReplicaRuntime.fanoutReplacement(
      await secondReplicaRuntime.getSnapshot(),
    );
    await vi.waitFor(() =>
      expect(secondReplicaRuntime.activeRegistrationCount()).toBe(0),
    );
    await Effect.runPromise(decodeRpc(await secondAcquisition.release()));

    const diagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    expect(diagnostics).toMatchObject([
      {
        activeRegistrationCount: 0,
        socketState: 'disconnected',
      },
    ]);
    expect(webSocketInstances).toHaveLength(1);
    expect(Reflect.get(secondReplicaRuntime, 'registrations')).toEqual([]);
    expect(secondFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();

    systemApi[Symbol.dispose]();
    secondSystemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
    secondChannel.port1.close();
    secondChannel.port2.close();
  });

  it('isolates aggregate authority selection and serialization across system and user namespaces', async () => {
    const secondAggregateState = Schema.decodeUnknownSync(
      AggregateFrontendSyncStateSchema,
    )({
      ...aggregateState,
      systemId: 'sys_2',
      userId: 'user_2',
    });
    const firstAuthority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-system-1-partition-1' }),
      ),
      pushCommands: vi.fn(async commands =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: commands.map(command => ({
            ...command,
            pushedAt: new Date('2026-01-01T00:00:01.123Z'),
            pushedCursor: 'pcur_system_1_partition_1',
            status: 'pushed',
          })),
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const secondAuthority = {
      getState: vi.fn(async () => encodeRight(secondAggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-system-2-partition-2' }),
      ),
      pushCommands: vi.fn(async commands =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: commands.map(command => ({
            ...command,
            pushedAt: new Date('2026-01-01T00:00:02.123Z'),
            pushedCursor: 'pcur_system_2_partition_2',
            status: 'pushed',
          })),
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const firstFrontendApi = makeAggregateFrontendApi(firstAuthority);
    const secondFrontendApi = makeAggregateFrontendApi(secondAuthority);
    const firstSink = makeAggregateSink();
    const secondSink = makeAggregateSink();
    const firstCommand = Schema.validateSync(StagedSessionCommandSchema)({
      id: 'cmd_system_1_partition_1',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: aggregateState.systemVersion,
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId: aggregateState.aggregateId,
      aggregateName: aggregateState.aggregateName,
      frontendName: aggregateState.frontendName,
      userId: aggregateState.userId,
      sessionId: 'sesn_system_1_partition_1',
      stagedCursor: 'stcur_system_1_partition_1',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const secondCommand = Schema.validateSync(StagedSessionCommandSchema)({
      ...firstCommand,
      id: 'cmd_system_2_partition_2',
      userId: secondAggregateState.userId,
      sessionId: 'sesn_system_2_partition_2',
      stagedCursor: 'stcur_system_2_partition_2',
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
    );
    const authenticationRuntime = ManagedRuntime.make(
      Layer.mergeAll(
        AsyncLive,
        Layer.succeed(PublishableKey, Redacted.make('pk_test')),
        Layer.succeed(ZerospinApiUrl, 'https://api.example'),
        makeTelemetryLayer(makeTelemetryCollector()),
      ),
    );
    const firstUserReplicaSqlite = await makeIdbSQLite3({
      databaseName: 'replicas.db',
      mode: 'create-or-open',
      vfsName: 'zerospin/056/sys_1/users/user_1',
      wasmUrl: 'https://worker.example/wa-sqlite-async.wasm',
    });
    const firstUserReplicaDb = makeAsyncWaSqliteDrizzle(
      firstUserReplicaSqlite,
      userReplicaDbConfig,
    );
    await Effect.runPromise(
      migrateUserReplicaDbAsync({
        db: firstUserReplicaDb,
        mode: 'create-or-open',
      }),
    );
    const secondUserReplicaSqlite = await makeIdbSQLite3({
      databaseName: 'replicas.db',
      mode: 'create-or-open',
      vfsName: 'zerospin/056/sys_2/users/user_2',
      wasmUrl: 'https://worker.example/wa-sqlite-async.wasm',
    });
    const secondUserReplicaDb = makeAsyncWaSqliteDrizzle(
      secondUserReplicaSqlite,
      userReplicaDbConfig,
    );
    await Effect.runPromise(
      migrateUserReplicaDbAsync({
        db: secondUserReplicaDb,
        mode: 'create-or-open',
      }),
    );
    const userReplicaStores = new Map([
      [
        `${aggregateState.systemId}/${aggregateState.userId}`,
        {
          userId: aggregateState.userId,
          userReplicaSqlite: firstUserReplicaSqlite,
          db: firstUserReplicaDb,
          systemId: aggregateState.systemId,
          vfsName: 'zerospin/056/sys_1/users/user_1',
          acquisitionTail: Promise.resolve(),
        },
      ],
      [
        `${secondAggregateState.systemId}/${secondAggregateState.userId}`,
        {
          userId: secondAggregateState.userId,
          userReplicaSqlite: secondUserReplicaSqlite,
          db: secondUserReplicaDb,
          systemId: secondAggregateState.systemId,
          vfsName: 'zerospin/056/sys_2/users/user_2',
          acquisitionTail: Promise.resolve(),
        },
      ],
    ]);
    const aggregateReplicaRuntimes = new Map<
      string,
      AggregateFrontendReplicaRepo
    >();
    const serviceReplicaRuntimes = new Map<
      string,
      ServiceFrontendReplicaRepo
    >();
    const firstOwnerToken = {};
    const secondOwnerToken = {};
    const firstAuthenticatedRoot = {
      authenticationLock: {
        signature: {
          version: '1.0.0',
          schemaJsonSchema: { type: 'object' },
        },
      },
      systemId: aggregateState.systemId,
      systemName: 'system-worker',
      systemVersion: '1.0.0',
      userId: aggregateState.userId,
      authenticatedApi: makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: firstFrontendApi,
      }),
      releaseAuthenticatedApi: vi.fn(),
    };
    const secondAuthenticatedRoot = {
      authenticationLock: {
        signature: {
          version: '1.0.0',
          schemaJsonSchema: { type: 'object' },
        },
      },
      systemId: secondAggregateState.systemId,
      systemName: 'system-worker',
      systemVersion: '1.0.0',
      userId: secondAggregateState.userId,
      authenticatedApi: makeAuthenticatedApi({
        systemId: secondAggregateState.systemId,
        userId: secondAggregateState.userId,
        aggregateFrontendApi: secondFrontendApi,
      }),
      releaseAuthenticatedApi: vi.fn(),
    };
    const firstUserPartitionRepo = new SharedWorkerUserPartitionRepo({
      userId: aggregateState.userId,
      ownerToken: firstOwnerToken,
      runtime,
      authenticationRuntime,
      systemId: aggregateState.systemId,
      systemName: 'system-worker',
      sharedWorkerWasmUrl: 'https://worker.example/wa-sqlite-async.wasm',
      sharedWorkerApiUrl: 'https://api.example',
      portState: { terminalError: null },
      userReplicaStores,
      aggregateReplicaRuntimes,
      serviceReplicaRuntimes,
      allocateRegistrationId: () => 1,
      getAuthenticatedApi: async () => firstAuthenticatedRoot,
      getCurrentAuthenticatedApi: () => firstAuthenticatedRoot.authenticatedApi,
    });
    const secondUserPartitionRepo = new SharedWorkerUserPartitionRepo({
      userId: secondAggregateState.userId,
      ownerToken: secondOwnerToken,
      runtime,
      authenticationRuntime,
      systemId: secondAggregateState.systemId,
      systemName: 'system-worker',
      sharedWorkerWasmUrl: 'https://worker.example/wa-sqlite-async.wasm',
      sharedWorkerApiUrl: 'https://api.example',
      portState: { terminalError: null },
      userReplicaStores,
      aggregateReplicaRuntimes,
      serviceReplicaRuntimes,
      allocateRegistrationId: () => 2,
      getAuthenticatedApi: async () => secondAuthenticatedRoot,
      getCurrentAuthenticatedApi: () =>
        secondAuthenticatedRoot.authenticatedApi,
    });

    const firstAcquisition = await Effect.runPromise(
      decodeRpc(
        await firstUserPartitionRepo.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink: firstSink,
        }),
      ),
    );
    const secondAcquisition = await Effect.runPromise(
      decodeRpc(
        await secondUserPartitionRepo.acquireAggregateFrontendReplica({
          aggregateId: secondAggregateState.aggregateId,
          aggregateName: secondAggregateState.aggregateName,
          frontendName: secondAggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink: secondSink,
        }),
      ),
    );
    expect([...aggregateReplicaRuntimes.keys()].toSorted()).toEqual([
      expect.stringMatching(/^sys_1\/user_1\/aggregate\/afrp_[a-zA-Z0-9_-]+$/u),
      expect.stringMatching(/^sys_2\/user_2\/aggregate\/afrp_[a-zA-Z0-9_-]+$/u),
    ]);
    const firstReplicaRuntime = [...aggregateReplicaRuntimes.values()].find(
      candidate =>
        candidate.userReplicaStore.systemId === aggregateState.systemId &&
        candidate.userReplicaStore.userId === aggregateState.userId,
    );
    if (firstReplicaRuntime === undefined) {
      throw new Error('first namespaced aggregate replica runtime missing');
    }
    const secondReplicaRuntime = [...aggregateReplicaRuntimes.values()].find(
      candidate =>
        candidate.userReplicaStore.systemId === secondAggregateState.systemId &&
        candidate.userReplicaStore.userId === secondAggregateState.userId,
    );
    if (secondReplicaRuntime === undefined) {
      throw new Error('second namespaced aggregate replica runtime missing');
    }
    const firstStageBarrier = Promise.withResolvers<void>();
    Reflect.set(firstReplicaRuntime, 'queueTail', firstStageBarrier.promise);

    const firstStage = firstUserPartitionRepo
      .stageAggregateFrontendCommand({
        target: {
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
        },
        sessionIndex: 1,
        command: firstCommand,
        mutations: [],
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await vi.waitFor(() =>
      expect(Reflect.get(firstReplicaRuntime, 'queueTail')).not.toBe(
        firstStageBarrier.promise,
      ),
    );
    let secondStageSettled = false;
    const secondStage = secondUserPartitionRepo
      .stageAggregateFrontendCommand({
        target: {
          aggregateId: secondAggregateState.aggregateId,
          aggregateName: secondAggregateState.aggregateName,
          frontendName: secondAggregateState.frontendName,
          aggregateFrontendLockKey,
        },
        sessionIndex: 1,
        command: secondCommand,
        mutations: [],
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)))
      .then(result => {
        secondStageSettled = true;
        return result;
      });
    await vi.waitFor(() => expect(secondStageSettled).toBe(true));
    await expect(secondStage).resolves.toMatchObject({
      commandId: secondCommand.id,
    });
    expect(firstReplicaRuntime).not.toBe(secondReplicaRuntime);

    firstStageBarrier.resolve();
    await expect(firstStage).resolves.toMatchObject({
      commandId: firstCommand.id,
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => {
      expect(firstAuthority.pushCommands).toHaveBeenCalled();
      expect(secondAuthority.pushCommands).toHaveBeenCalled();
    });
    expect(
      firstAuthority.pushCommands.mock.calls.flatMap(([commands]) =>
        commands.map(command => command.id),
      ),
    ).toContain(firstCommand.id);
    expect(
      firstAuthority.pushCommands.mock.calls.flatMap(([commands]) =>
        commands.map(command => command.id),
      ),
    ).not.toContain(secondCommand.id);
    expect(
      secondAuthority.pushCommands.mock.calls.flatMap(([commands]) =>
        commands.map(command => command.id),
      ),
    ).toContain(secondCommand.id);
    expect(
      secondAuthority.pushCommands.mock.calls.flatMap(([commands]) =>
        commands.map(command => command.id),
      ),
    ).not.toContain(firstCommand.id);

    await vi.waitFor(() =>
      expect(firstReplicaRuntime.pushInFlight).toBe(false),
    );
    const firstCurrentState = await firstReplicaRuntime.getSnapshot();
    makeTxAsync.mockImplementationOnce(props =>
      Effect.gen(function* () {
        const client = Reflect.get(props.db, '$client');
        client.run('BEGIN');
        return yield* props.program({ tx: props.db }).pipe(
          Effect.onExit(exit =>
            Effect.sync(() => {
              client.run(Exit.isSuccess(exit) ? 'COMMIT' : 'ROLLBACK');
            }),
          ),
        );
      }),
    );
    const canonicalBlock = {
      frontendName: aggregateState.frontendName,
      lastAggregateCursor: 'acur_child_before_parent',
      frontendIndex: 1,
      delta: {
        inserted: [
          {
            id: 'lst_child_before_parent',
            modelName: List.modelName,
            createdAt: new Date('2026-01-01T00:00:03.123Z'),
            updatedAt: new Date('2026-01-01T00:00:03.123Z'),
            version: List.version,
            name: 'Child before parent',
            userId: 'usr_child_before_parent',
          },
          {
            id: 'usr_child_before_parent',
            modelName: User.modelName,
            createdAt: new Date('2026-01-01T00:00:03.123Z'),
            updatedAt: new Date('2026-01-01T00:00:03.123Z'),
            version: User.version,
            name: 'Parent',
          },
        ],
        updated: [],
        deleted: [],
      },
      pendingPushedCommands: firstCurrentState.pushedCommands,
      executedPushedCommands: [],
      failedPushedCommands: [],
    };
    await firstReplicaRuntime.applyServerBlock(canonicalBlock, () => undefined);
    const childFirstState = await firstReplicaRuntime.getSnapshot();
    expect(childFirstState.frontendIndex).toBe(1);
    expect(
      childFirstState.resources.map(resource => resource.id).toSorted(),
    ).toEqual(
      ['lst_child_before_parent', 'usr_child_before_parent'].toSorted(),
    );
    const blockCountAfterCanonicalCommit =
      firstSink.handleBlock.mock.calls.length;
    await firstReplicaRuntime.applyServerBlock(canonicalBlock, () => undefined);
    expect(await firstReplicaRuntime.getSnapshot()).toEqual(childFirstState);
    expect(firstSink.handleBlock).toHaveBeenCalledTimes(
      blockCountAfterCanonicalCommit,
    );

    await Effect.runPromise(decodeRpc(await firstAcquisition.release()));
    await Effect.runPromise(decodeRpc(await secondAcquisition.release()));
    await Effect.runPromise(decodeRpc(await firstAcquisition.release()));
    await Effect.runPromise(decodeRpc(await secondAcquisition.release()));
    expect(firstFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    expect(secondFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    expect(Reflect.get(firstReplicaRuntime, 'registrations')).toEqual([]);
    expect(Reflect.get(secondReplicaRuntime, 'registrations')).toEqual([]);
    await authenticationRuntime.dispose();
    await runtime.dispose();
  });

  it('rejects mismatched aggregate and service lock-key acquisition envelopes without creating replicas', async () => {
    const aggregateAuthority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-invalid-aggregate-lock-key' }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const serviceAuthority = {
      getState: vi.fn(async () => encodeRight(serviceState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-invalid-service-lock-key' }),
      ),
    };
    const aggregateFrontendApi = makeAggregateFrontendApi(aggregateAuthority);
    const serviceFrontendApi = makeServiceFrontendApi(serviceAuthority);
    const aggregateSink = makeAggregateSink();
    const serviceSink = makeServiceSink();

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi,
        serviceFrontendApi,
      }),
    );

    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.acquireAggregateFrontendReplica({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey: alternateAggregateFrontendLockKey,
            aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
            frontendSpec: aggregateFrontendSpec,
            mode: 'online',
            sink: aggregateSink,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-frontend-lock-key-mismatch');
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.acquireServiceFrontendReplica({
            serviceName: serviceState.serviceName,
            frontendName: serviceState.frontendName,
            serviceFrontendLockKey: aggregateFrontendLockKey,
            serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
            frontendSpec: serviceFrontendSpec,
            mode: 'online',
            sink: serviceSink,
          }),
        ),
      ),
    ).rejects.toThrow('service-frontend-lock-key-mismatch');

    await expect(
      Effect.runPromise(
        decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
      ),
    ).resolves.toEqual([]);
    await expect(
      Effect.runPromise(
        decodeRpc(await userReplicaApi.listServiceFrontendReplicas()),
      ),
    ).resolves.toEqual([]);
    expect(aggregateAuthority.getState).not.toHaveBeenCalled();
    expect(serviceAuthority.getState).not.toHaveBeenCalled();

    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('separates exact-lock databases, journals, sockets, optimism, and offline reopening', async () => {
    const firstAuthority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-first-lock' }),
      ),
      pushCommands: vi.fn(async commands =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: commands.map(command => ({
            ...command,
            pushedAt: new Date('2026-01-01T00:00:01.123Z'),
            pushedCursor: `pcur_${command.id}`,
            status: 'pushed',
          })),
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const alternateAuthority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-alternate-lock' }),
      ),
      pushCommands: vi.fn(async commands =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: commands.map(command => ({
            ...command,
            pushedAt: new Date('2026-01-01T00:00:01.123Z'),
            pushedCursor: 'pcur_different_lock',
            status: 'pushed',
          })),
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const firstFrontendApi = makeAggregateFrontendApi(firstAuthority);
    const alternateFrontendApi = makeAggregateFrontendApi(alternateAuthority);
    const firstSink = makeAggregateSink();
    const alternateSink = makeAggregateSink();
    const command = Schema.validateSync(StagedSessionCommandSchema)({
      id: 'cmd_different_lock',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: aggregateState.systemVersion,
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId: aggregateState.aggregateId,
      aggregateName: aggregateState.aggregateName,
      frontendName: aggregateState.frontendName,
      userId: aggregateState.userId,
      sessionId: 'sesn_different_lock',
      stagedCursor: 'stcur_different_lock',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const secondCommand = Schema.validateSync(StagedSessionCommandSchema)({
      ...command,
      id: 'cmd_different_lock_second',
      stagedCursor: 'stcur_different_lock_second',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedAggregateFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_different_lock',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Only first lock' },
        }),
      },
    ]);
    const secondMutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedAggregateFrontendMutationSchema),
    )([
      {
        commandId: secondCommand.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_different_lock_second',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Second target command' },
        }),
      },
    ]);

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontends: [
          {
            frontendApi: firstFrontendApi,
            frontendSpec: aggregateFrontendSpec,
          },
          {
            frontendApi: alternateFrontendApi,
            frontendSpec: alternateAggregateFrontendSpec,
          },
        ],
      }),
    );

    const firstAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink: firstSink,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await firstAcquisition.getState()));
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 1,
          command,
          mutations,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 2,
          command: secondCommand,
          mutations: secondMutations,
        }),
      ),
    );
    const partitionDatabase = databaseClients.get(
      'zerospin/056/sys_1/users/user_1/replicas.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }

    const alternateAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey: alternateAggregateFrontendLockKey,
          aggregateFrontendLock: alternateAggregateFrontendLock,
          frontendSpec: alternateAggregateFrontendSpec,
          mode: 'online',
          sink: alternateSink,
        }),
      ),
    );
    const alternateState = await Effect.runPromise(
      decodeRpc(await alternateAcquisition.getState()),
    );
    expect(alternateState.aggregateFrontendLockKey).toBe(
      alternateAggregateFrontendLockKey,
    );
    expect(alternateState.replicaIndex).toBe(0);
    expect(alternateState.stagedCommands).toEqual([]);
    expect(alternateState.resources).toEqual([]);

    const diagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    expect(diagnostics).toHaveLength(2);
    expect(
      diagnostics.map(replica => replica.aggregateFrontendLockKey).toSorted(),
    ).toEqual(
      [aggregateFrontendLockKey, alternateAggregateFrontendLockKey].toSorted(),
    );
    expect(new Set(diagnostics.map(replica => replica.databaseName)).size).toBe(
      2,
    );
    const firstLockDiagnostic = diagnostics.find(
      replica => replica.aggregateFrontendLockKey === aggregateFrontendLockKey,
    );
    if (firstLockDiagnostic === undefined) {
      throw new Error('first lock diagnostic missing');
    }
    const aggregateDatabase = databaseClients.get(
      `zerospin/056/sys_1/users/user_1/aggregate/${firstLockDiagnostic.databaseName}`,
    );
    if (aggregateDatabase === undefined) {
      throw new Error('exact aggregate database missing');
    }
    expect(
      aggregateDatabase
        .exec("PRAGMA table_info('aggregateFrontendReplicaMetadata')")[0]
        ?.values.map(row => row[1]),
    ).toEqual(['id', 'systemVersion', 'frontendIndex', 'replicaIndex']);
    expect(
      aggregateDatabase
        .exec("PRAGMA table_info('aggregateFrontendCommandJournal')")[0]
        ?.values.map(row => row[1]),
    ).toEqual([
      'commandId',
      'sessionId',
      'sessionIndex',
      'command',
      'mutations',
      'appliedMutationInverses',
    ]);
    expect(
      aggregateDatabase.exec(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )[0]?.values,
    ).toEqual(
      [
        ...Object.keys(aggregateFrontendSpec.models),
        'aggregateFrontendCommandJournal',
        'aggregateFrontendReplicaMetadata',
      ]
        .toSorted()
        .map(name => [name]),
    );
    expect(
      aggregateDatabase
        .exec("PRAGMA index_list('aggregateFrontendCommandJournal')")[0]
        ?.values.some(
          row =>
            row[1] === 'aggregate_frontend_command_journal_session_idx' &&
            row[2] === 1,
        ),
    ).toBe(true);
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(2));
    expect(webSocketInstances.map(socket => socket.url).toSorted()).toEqual([
      expect.stringContaining('ticket=ticket-alternate-lock'),
      expect.stringContaining('ticket=ticket-first-lock'),
    ]);
    expect(
      aggregateDatabase.exec(
        'SELECT COUNT(*) FROM aggregateFrontendCommandJournal',
      )[0]?.values,
    ).toEqual([[2]]);
    const originalJournalRows = aggregateDatabase.exec(
      'SELECT commandId, command FROM aggregateFrontendCommandJournal ORDER BY commandId',
    )[0]?.values;
    expect(originalJournalRows).toEqual([
      [command.id, expect.any(String)],
      [secondCommand.id, expect.any(String)],
    ]);
    expect(JSON.parse(String(originalJournalRows?.[0]?.[1]))).toMatchObject({
      id: command.id,
      status: 'staged',
      pushedCursor: null,
    });
    expect(JSON.parse(String(originalJournalRows?.[1]?.[1]))).toMatchObject({
      id: secondCommand.id,
      status: 'staged',
      pushedCursor: null,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(firstAuthority.pushCommands.mock.calls.length).toBeGreaterThan(0),
    );
    expect(alternateAuthority.pushCommands).not.toHaveBeenCalled();
    const activeJournalRows = aggregateDatabase.exec(
      'SELECT commandId, command FROM aggregateFrontendCommandJournal ORDER BY commandId',
    )[0]?.values;
    expect(
      activeJournalRows?.map(([commandId, encoded]) => [
        commandId,
        JSON.parse(String(encoded)).status,
        JSON.parse(String(encoded)).replicaIndex,
      ]),
    ).toEqual([
      [command.id, 'staged', 1],
      [secondCommand.id, 'staged', 2],
    ]);
    const activeState = await Effect.runPromise(
      decodeRpc(await firstAcquisition.getState()),
    );
    expect(
      activeState.stagedCommands.map(staged => staged.id).toSorted(),
    ).toEqual([command.id, secondCommand.id].toSorted());
    expect(activeState.pushedCommands).toEqual([]);
    const stillIsolatedAlternateState = await Effect.runPromise(
      decodeRpc(await alternateAcquisition.getState()),
    );
    expect(stillIsolatedAlternateState.stagedCommands).toEqual([]);
    expect(stillIsolatedAlternateState.pushedCommands).toEqual([]);
    expect(stillIsolatedAlternateState.resources).toEqual([]);

    const firstStagedReplicaCommand = activeState.stagedCommands.find(
      staged => staged.id === command.id,
    );
    const secondStagedReplicaCommand = activeState.stagedCommands.find(
      staged => staged.id === secondCommand.id,
    );
    if (
      firstStagedReplicaCommand === undefined ||
      secondStagedReplicaCommand === undefined
    ) {
      throw new Error('staged replica commands missing');
    }
    const executedCommand = Schema.validateSync(ExecutedPushedCommandSchema)({
      ...firstStagedReplicaCommand,
      pushedAt: new Date('2026-01-01T00:00:01.123Z'),
      pushedCursor: `pcur_${firstStagedReplicaCommand.id}`,
      mode: 'optimistic-lww',
      aggregateCursor: 'acur_different_lock_terminal',
      aggregateIndex: 1,
      executedAt: new Date('2026-01-01T00:00:02.123Z'),
      status: 'executed',
    });
    const failedCommand = Schema.validateSync(FailedPushedCommandSchema)({
      ...secondStagedReplicaCommand,
      pushedAt: new Date('2026-01-01T00:00:01.123Z'),
      pushedCursor: `pcur_${secondStagedReplicaCommand.id}`,
      aggregateCursor: 'acur_different_lock_terminal',
      aggregateIndex: 1,
      failedAt: new Date('2026-01-01T00:00:02.123Z'),
      failure: 'Rejected by the aggregate',
      status: 'failed',
    });
    const firstLockSocket = webSocketInstances.find(socket =>
      socket.url.includes('ticket=ticket-first-lock'),
    );
    if (firstLockSocket === undefined) {
      throw new Error('first lock socket missing');
    }
    firstLockSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'aggregateFrontendBlock',
          sync: {
            frontendName: aggregateState.frontendName,
            lastAggregateCursor: 'acur_different_lock_terminal',
            frontendIndex: 1,
            delta: { inserted: [], updated: [], deleted: [] },
            pendingPushedCommands: [],
            executedPushedCommands: [executedCommand],
            failedPushedCommands: [failedCommand],
          },
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(
        aggregateDatabase.exec(
          'SELECT COUNT(*) FROM aggregateFrontendCommandJournal',
        )[0]?.values,
      ).toEqual([[0]]),
    );
    const terminalState = await Effect.runPromise(
      decodeRpc(await firstAcquisition.getState()),
    );
    expect(terminalState.executedPushedCommands).toEqual([]);
    expect(terminalState.failedPushedCommands).toEqual([]);
    expect(terminalState.resources).toEqual([]);
    expect(firstSink.handleBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'server',
        frontendBlock: expect.objectContaining({
          executedPushedCommands: [executedCommand],
          failedPushedCommands: [failedCommand],
        }),
      }),
    );

    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.setPushPaused({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          pushPaused: true,
        }),
      ),
    );

    const immediateCommand = Schema.validateSync(StagedSessionCommandSchema)({
      ...command,
      id: 'cmd_immediate_executed',
      stagedCursor: 'stcur_immediate_executed',
    });
    const immediateMutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedAggregateFrontendMutationSchema),
    )([
      {
        commandId: immediateCommand.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_immediate_executed',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Immediate executed command' },
        }),
      },
    ]);
    firstAuthority.pushCommands.mockImplementationOnce(async commands =>
      encodeRight({
        writeIndex: 1,
        guardedAtAggregateCursor: null,
        pendingCommands: [],
        pushedCommands: [],
        executedCommands: commands.map(pushed =>
          Schema.validateSync(ExecutedPushedCommandSchema)({
            ...pushed,
            pushedAt: new Date('2026-01-01T00:00:03.123Z'),
            pushedCursor: `pcur_${pushed.id}`,
            mode: 'optimistic-lww',
            aggregateCursor: 'acur_immediate_executed',
            aggregateIndex: 2,
            executedAt: new Date('2026-01-01T00:00:04.123Z'),
            status: 'executed',
          }),
        ),
        failedStagedCommands: [],
        failedPushedCommands: [],
      }),
    );
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 3,
          command: immediateCommand,
          mutations: immediateMutations,
        }),
      ),
    );
    const blockCountAfterImmediateStage =
      firstSink.handleBlock.mock.calls.length;
    const replacementCountAfterImmediateStage =
      firstSink.replaceState.mock.calls.length;
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).resolves.toEqual({ status: 'pushed' });
    expect(firstSink.handleBlock).toHaveBeenCalledTimes(
      blockCountAfterImmediateStage,
    );
    expect(firstSink.replaceState).toHaveBeenCalledTimes(
      replacementCountAfterImmediateStage,
    );
    await expect(
      Effect.runPromise(decodeRpc(await firstAcquisition.getState())),
    ).resolves.toMatchObject({
      stagedCommands: [expect.objectContaining({ id: immediateCommand.id })],
      executedPushedCommands: [],
      resources: [expect.objectContaining({ id: 'acct_immediate_executed' })],
    });

    const immediateFailedCommand = Schema.validateSync(
      StagedSessionCommandSchema,
    )({
      ...command,
      id: 'cmd_immediate_failed',
      stagedCursor: 'stcur_immediate_failed',
    });
    const immediateFailedMutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedAggregateFrontendMutationSchema),
    )([
      {
        commandId: immediateFailedCommand.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_immediate_failed',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Immediate failed command' },
        }),
      },
    ]);
    firstAuthority.pushCommands.mockImplementationOnce(async commands =>
      encodeRight({
        writeIndex: 1,
        guardedAtAggregateCursor: null,
        pendingCommands: [],
        pushedCommands: [],
        executedCommands: commands
          .filter(staged => staged.id === immediateCommand.id)
          .map(staged =>
            Schema.validateSync(ExecutedPushedCommandSchema)({
              ...staged,
              pushedAt: new Date('2026-01-01T00:00:03.123Z'),
              pushedCursor: `pcur_${staged.id}`,
              mode: 'optimistic-lww',
              aggregateCursor: 'acur_immediate_executed',
              aggregateIndex: 2,
              executedAt: new Date('2026-01-01T00:00:04.123Z'),
              status: 'executed',
            }),
          ),
        failedStagedCommands: commands
          .filter(staged => staged.id === immediateFailedCommand.id)
          .map(staged =>
            Schema.validateSync(FailedStagedReplicaCommandSchema)({
              ...staged,
              failedAt: new Date('2026-01-01T00:00:05.123Z'),
              failure: 'Rejected before push',
              status: 'failed',
            }),
          ),
        failedPushedCommands: [],
      }),
    );
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 4,
          command: immediateFailedCommand,
          mutations: immediateFailedMutations,
        }),
      ),
    );
    const replacementCountBeforeImmediateFailure =
      firstSink.replaceState.mock.calls.length;
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).resolves.toEqual({ status: 'pushed' });
    expect(firstSink.replaceState).toHaveBeenCalledTimes(
      replacementCountBeforeImmediateFailure + 1,
    );
    expect(firstSink.replaceState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failedStagedCommands: [
          expect.objectContaining({ id: immediateFailedCommand.id }),
        ],
        resources: [expect.objectContaining({ id: 'acct_immediate_executed' })],
      }),
    );
    expect(
      (
        await Effect.runPromise(decodeRpc(await firstAcquisition.getState()))
      ).resources.map(resource => resource.id),
    ).toEqual(['acct_immediate_executed']);

    await Effect.runPromise(decodeRpc(await alternateAcquisition.release()));
    const offlineAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          userId: aggregateState.userId,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey: alternateAggregateFrontendLockKey,
          aggregateFrontendLock: alternateAggregateFrontendLock,
          frontendSpec: alternateAggregateFrontendSpec,
          mode: 'existing-only',
          sink: alternateSink,
        }),
      ),
    );
    const offlineState = await Effect.runPromise(
      decodeRpc(await offlineAcquisition.getState()),
    );
    expect(offlineState.aggregateFrontendLockKey).toBe(
      alternateAggregateFrontendLockKey,
    );
    expect(alternateAuthority.getState).toHaveBeenCalledTimes(1);

    const databaseCountBeforeOfflineMiss = databaseClients.size;
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.acquireAggregateFrontendReplica({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            userId: aggregateState.userId,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey: unavailableAggregateFrontendLockKey,
            aggregateFrontendLock: unavailableAggregateFrontendLock,
            frontendSpec: unavailableAggregateFrontendSpec,
            mode: 'existing-only',
            sink: alternateSink,
          }),
        ),
      ),
    ).rejects.toThrow('cached-aggregate-frontend-replica-unavailable');
    expect(databaseClients.size).toBe(databaseCountBeforeOfflineMiss);

    await Effect.runPromise(decodeRpc(await offlineAcquisition.release()));
    await Effect.runPromise(decodeRpc(await firstAcquisition.release()));
    const zeroOwnerDiagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    expect(zeroOwnerDiagnostics).toHaveLength(2);
    expect(
      zeroOwnerDiagnostics.map(replica => replica.activeRegistrationCount),
    ).toEqual([0, 0]);
    const retainedJournalRows = aggregateDatabase.exec(
      'SELECT commandId, command, mutations, appliedMutationInverses FROM aggregateFrontendCommandJournal ORDER BY commandId',
    )[0]?.values;
    expect(retainedJournalRows).toHaveLength(1);
    expect(retainedJournalRows?.[0]?.[0]).toBe(immediateCommand.id);
    expect(JSON.parse(String(retainedJournalRows?.[0]?.[1]))).toMatchObject({
      id: immediateCommand.id,
      replicaIndex: 4,
      status: 'staged',
    });
    expect(retainedJournalRows?.[0]?.[2]).toEqual(expect.any(String));
    expect(retainedJournalRows?.[0]?.[3]).toEqual(expect.any(String));

    const aggregateReplicaRuntimes = Reflect.get(
      Reflect.get(userReplicaApi, 'props'),
      'aggregateReplicaRuntimes',
    );
    if (!(aggregateReplicaRuntimes instanceof Map)) {
      throw new Error('aggregate replica runtime map missing');
    }
    aggregateReplicaRuntimes.clear();
    const restartedOfflineAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          userId: aggregateState.userId,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'existing-only',
          sink: firstSink,
        }),
      ),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(await restartedOfflineAcquisition.getState()),
      ),
    ).resolves.toMatchObject({
      replicaIndex: 6,
      stagedCommands: [
        expect.objectContaining({ id: immediateCommand.id, replicaIndex: 4 }),
      ],
      resources: [expect.objectContaining({ id: 'acct_immediate_executed' })],
    });
    const ticketsBeforeOnlineReplacement =
      firstAuthority.createWebSocketTicket.mock.calls.length;
    const restartedOnlineAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink: firstSink,
        }),
      ),
    );
    expect(firstAuthority.getState).toHaveBeenCalledTimes(2);
    expect(firstAuthority.createWebSocketTicket).toHaveBeenCalledTimes(
      ticketsBeforeOnlineReplacement,
    );
    await expect(
      Effect.runPromise(decodeRpc(await restartedOnlineAcquisition.getState())),
    ).resolves.toMatchObject({
      frontendIndex: aggregateState.frontendIndex,
      replicaIndex: 7,
      stagedCommands: [
        expect.objectContaining({ id: immediateCommand.id, replicaIndex: 4 }),
      ],
      resources: [expect.objectContaining({ id: 'acct_immediate_executed' })],
    });
    await Effect.runPromise(
      decodeRpc(await restartedOfflineAcquisition.release()),
    );
    await Effect.runPromise(
      decodeRpc(await restartedOnlineAcquisition.release()),
    );
    aggregateReplicaRuntimes.clear();
    aggregateDatabase.run(
      'ALTER TABLE aggregateFrontendReplicaMetadata ADD COLUMN lifecycle text',
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.acquireAggregateFrontendReplica({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            userId: aggregateState.userId,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
            aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
            frontendSpec: aggregateFrontendSpec,
            mode: 'existing-only',
            sink: firstSink,
          }),
        ),
      ),
    ).rejects.toThrow('browser-persistence-reset-required');
    expect(
      aggregateDatabase
        .exec("PRAGMA table_info('aggregateFrontendReplicaMetadata')")[0]
        ?.values.map(row => row[1]),
    ).toEqual([
      'id',
      'systemVersion',
      'frontendIndex',
      'replicaIndex',
      'lifecycle',
    ]);
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('preserves an initial unsupported lock error without publishing replica state or deleting browser bytes', async () => {
    const unsupportedFailure = new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message: 'The requested aggregate frontend lock is unavailable',
    });
    const authority = {
      getState: vi.fn(async () => encodeLeft(unsupportedFailure)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'unused-ticket' }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const frontendApi = makeAggregateFrontendApi(authority);
    const sink = makeAggregateSink();
    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: frontendApi,
      }),
    );

    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.acquireAggregateFrontendReplica({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
            aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
            frontendSpec: aggregateFrontendSpec,
            mode: 'online',
            sink,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-frontend-lock-unsupported');
    const diagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    expect(diagnostics).toEqual([]);
    expect(databaseClients.size).toBe(2);
    expect(
      [...databaseClients.keys()].filter(databaseKey =>
        databaseKey.includes('/aggregate/'),
      ),
    ).toHaveLength(1);

    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('makes only the exact Repo terminal on unsupported authority without authorizing a sibling child', async () => {
    const unsupportedFailure = new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message: 'The admitted aggregate frontend lock is no longer available',
    });
    const authority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-unsupported-push' }),
      ),
      pushCommands: vi.fn(async () => encodeLeft(unsupportedFailure)),
    };
    const secondAuthority = {
      ...authority,
      pushCommands: vi.fn(async commands =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: commands.map(command => ({
            ...command,
            pushedAt: new Date('2026-01-01T00:00:01.123Z'),
            pushedCursor: `pcur_${command.id}`,
            status: 'pushed',
          })),
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const frontendApi = makeAggregateFrontendApi(authority);
    const secondFrontendApi = makeAggregateFrontendApi(secondAuthority);
    const authenticatedApi = makeAuthenticatedApi({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      aggregateFrontendApi: frontendApi,
    });
    const secondAuthenticatedApi = makeAuthenticatedApi({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      aggregateFrontendApi: secondFrontendApi,
    });
    const sink = makeAggregateSink();
    const secondSink = makeAggregateSink();
    const command = Schema.validateSync(StagedSessionCommandSchema)({
      id: 'cmd_unsupported_push',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: aggregateState.systemVersion,
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId: aggregateState.aggregateId,
      aggregateName: aggregateState.aggregateName,
      frontendName: aggregateState.frontendName,
      userId: aggregateState.userId,
      sessionId: 'sesn_unsupported_push',
      stagedCursor: 'stcur_unsupported_push',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedAggregateFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_unsupported_push',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Unsupported push' },
        }),
      },
    ]);

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(systemApi, authenticatedApi);
    const secondChannel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [secondChannel.port1] }));
    const secondSystemApi = systemApis.get(1);
    if (secondSystemApi === undefined) {
      throw new Error('second system api missing');
    }
    const secondUserPartitionRepo = await openUserPartition(
      secondSystemApi,
      secondAuthenticatedApi,
    );
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getState()));
    const secondAcquisition = await Effect.runPromise(
      decodeRpc(
        await secondUserPartitionRepo.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink: secondSink,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await secondAcquisition.getState()));
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 1,
          command,
          mutations,
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(750);
    await vi.waitFor(() => {
      expect(sink.handleFailure).toHaveBeenCalledTimes(1);
      expect(secondSink.handleFailure).toHaveBeenCalledTimes(1);
    });
    expect(sink.handleFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'aggregate-frontend-lock-unsupported' }),
    );
    expect(secondSink.handleFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'aggregate-frontend-lock-unsupported' }),
    );
    expect(authority.pushCommands).toHaveBeenCalled();
    expect(secondAuthority.pushCommands).not.toHaveBeenCalled();
    expect(
      secondAuthenticatedApi.getAggregateFrontendApi,
    ).not.toHaveBeenCalled();
    expect(frontendApi[Symbol.dispose]).toHaveBeenCalledTimes(1);
    expect(secondFrontendApi[Symbol.dispose]).not.toHaveBeenCalled();
    const diagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    expect(diagnostics).toMatchObject([
      {
        aggregateFrontendLockKey,
        status: 'failed',
        activeRegistrationCount: 2,
      },
    ]);
    await expect(
      Effect.runPromise(decodeRpc(await acquisition.getState())),
    ).resolves.toMatchObject({
      aggregateFrontendLockKey,
      replicaIndex: 1,
      resources: [{ id: 'acct_unsupported_push' }],
    });
    await expect(
      Effect.runPromise(decodeRpc(await secondAcquisition.getState())),
    ).resolves.toMatchObject({
      aggregateFrontendLockKey,
      replicaIndex: 1,
      resources: [{ id: 'acct_unsupported_push' }],
    });
    await expect(
      Effect.runPromise(
        decodeRpc(
          await secondUserPartitionRepo.stageAggregateFrontendCommand({
            target: {
              aggregateId: aggregateState.aggregateId,
              aggregateName: aggregateState.aggregateName,
              frontendName: aggregateState.frontendName,
              aggregateFrontendLockKey,
            },
            sessionIndex: 1,
            command,
            mutations,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-frontend-lock-unsupported');
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.stageAggregateFrontendCommand({
            target: {
              aggregateId: aggregateState.aggregateId,
              aggregateName: aggregateState.aggregateName,
              frontendName: aggregateState.frontendName,
              aggregateFrontendLockKey,
            },
            sessionIndex: 1,
            command,
            mutations,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-frontend-lock-unsupported');

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    await Effect.runPromise(decodeRpc(await secondAcquisition.release()));
    secondSystemApi[Symbol.dispose]();
    secondChannel.port1.close();
    secondChannel.port2.close();
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('keeps service replicas read-only and journal-free across release and offline reopening', async () => {
    const authority = {
      getState: vi.fn(async () => encodeRight(serviceState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-service' }),
      ),
    };
    const frontendApi = makeServiceFrontendApi(authority);
    const sink = makeServiceSink();

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: serviceState.systemId,
        userId: serviceState.userId,
        serviceFrontendApi: frontendApi,
      }),
    );

    const acquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireServiceFrontendReplica({
          serviceName: serviceFrontend.serviceName,
          frontendName: serviceFrontend.frontendName,
          serviceFrontendLockKey,
          serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
          frontendSpec: serviceFrontendSpec,
          mode: 'online',
          sink,
        }),
      ),
    );
    const acquiredState = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    expect(acquiredState).toMatchObject({
      serviceName: serviceFrontend.serviceName,
      frontendName: serviceFrontend.frontendName,
      serviceFrontendLockKey,
      replicaIndex: 0,
    });
    const partitionDatabase = databaseClients.get(
      'zerospin/056/sys_1/users/user_1/replicas.db',
    );
    if (partitionDatabase === undefined) {
      throw new Error('partition database missing');
    }
    expect(
      partitionDatabase.exec('SELECT COUNT(*) FROM serviceFrontendReplicas')[0]
        ?.values,
    ).toEqual([[1]]);
    expect(
      partitionDatabase.exec(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'aggregateFrontendCommandJournal'",
      )[0]?.values,
    ).toEqual([[0]]);
    expect(
      partitionDatabase.exec(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'aggregateFrontendCommandMaterializations'",
      )[0]?.values,
    ).toEqual([[0]]);
    expect(
      [...databaseClients.keys()].filter(databaseKey =>
        databaseKey.includes('/service/'),
      ),
    ).toHaveLength(1);
    expect(
      [...databaseClients.keys()].filter(databaseKey =>
        databaseKey.includes('/aggregate/'),
      ),
    ).toHaveLength(0);
    const serviceDiagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listServiceFrontendReplicas()),
    );
    const serviceDiagnostic = serviceDiagnostics[0];
    if (serviceDiagnostic === undefined) {
      throw new Error('service diagnostic missing');
    }
    const serviceDatabase = databaseClients.get(
      `zerospin/056/sys_1/users/user_1/service/${serviceDiagnostic.databaseName}`,
    );
    if (serviceDatabase === undefined) {
      throw new Error('exact service database missing');
    }
    expect(
      serviceDatabase
        .exec("PRAGMA table_info('serviceFrontendReplicaMetadata')")[0]
        ?.values.map(row => row[1]),
    ).toEqual(['id', 'systemVersion', 'frontendIndex', 'replicaIndex']);
    expect(
      serviceDatabase.exec(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )[0]?.values,
    ).toEqual([['category'], ['product'], ['serviceFrontendReplicaMetadata']]);

    await vi.waitFor(() =>
      expect(
        webSocketInstances.find(socket =>
          socket.url.includes('ticket=ticket-service'),
        ),
      ).toBeDefined(),
    );
    const serviceSocket = webSocketInstances.find(socket =>
      socket.url.includes('ticket=ticket-service'),
    );
    if (serviceSocket === undefined) {
      throw new Error('service socket missing');
    }
    makeTxAsync.mockImplementationOnce(props =>
      Effect.gen(function* () {
        const client = Reflect.get(props.db, '$client');
        client.run('BEGIN');
        return yield* props.program({ tx: props.db }).pipe(
          Effect.onExit(exit =>
            Effect.sync(() => {
              client.run(Exit.isSuccess(exit) ? 'COMMIT' : 'ROLLBACK');
            }),
          ),
        );
      }),
    );
    serviceSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'serviceFrontendBlock',
          sync: {
            serviceName: serviceFrontend.serviceName,
            userId: serviceState.userId,
            frontendName: serviceFrontend.frontendName,
            frontendIndex: 1,
            lastServiceCursor: 'svcur_child_before_parent',
            delta: {
              inserted: [
                {
                  id: 'prd_service_child_before_parent',
                  modelName: ServiceProduct.modelName,
                  createdAt: new Date('2026-01-01T00:00:01.123Z'),
                  updatedAt: new Date('2026-01-01T00:00:01.123Z'),
                  deletedAt: null,
                  version: ServiceProduct.version,
                  name: 'Service child before parent',
                  categoryId: 'cat_service_child_before_parent',
                },
                {
                  id: 'cat_service_child_before_parent',
                  modelName: ServiceCategory.modelName,
                  createdAt: new Date('2026-01-01T00:00:01.123Z'),
                  updatedAt: new Date('2026-01-01T00:00:01.123Z'),
                  deletedAt: null,
                  version: ServiceCategory.version,
                  name: 'Service parent',
                },
              ],
              updated: [],
              deleted: [],
            },
          },
        }),
      }),
    );
    await vi.waitFor(async () => {
      const childFirstState = await Effect.runPromise(
        decodeRpc(await acquisition.getState()),
      );
      expect(childFirstState.frontendIndex).toBe(1);
      expect(
        childFirstState.resources.map(resource => resource.id).toSorted(),
      ).toEqual(
        [
          'cat_service_child_before_parent',
          'prd_service_child_before_parent',
        ].toSorted(),
      );
    });

    makeTxAsync.mockImplementationOnce(props =>
      Effect.gen(function* () {
        const client = Reflect.get(props.db, '$client');
        client.run('BEGIN');
        return yield* props.program({ tx: props.db }).pipe(
          Effect.onExit(exit =>
            Effect.sync(() => {
              client.run(Exit.isSuccess(exit) ? 'COMMIT' : 'ROLLBACK');
            }),
          ),
        );
      }),
    );
    serviceSocket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'serviceFrontendBlock',
          sync: {
            serviceName: serviceFrontend.serviceName,
            userId: serviceState.userId,
            frontendName: serviceFrontend.frontendName,
            frontendIndex: 2,
            lastServiceCursor: 'svcur_parent_before_child_delete',
            delta: {
              inserted: [],
              updated: [],
              deleted: [
                {
                  id: 'cat_service_child_before_parent',
                  modelName: ServiceCategory.modelName,
                },
                {
                  id: 'prd_service_child_before_parent',
                  modelName: ServiceProduct.modelName,
                },
              ],
            },
          },
        }),
      }),
    );
    await vi.waitFor(async () => {
      const parentFirstDeleteState = await Effect.runPromise(
        decodeRpc(await acquisition.getState()),
      );
      expect(parentFirstDeleteState.frontendIndex).toBe(2);
      expect(parentFirstDeleteState.resources).toEqual([]);
    });

    sink.replaceState.mockResolvedValueOnce(
      encodeLeft(
        new ZerospinError({
          code: 'service-sink-replacement-test-failed',
          message: 'Service sink rejected its replacement state',
        }),
      ),
    );
    const serviceReplicaRuntime = Reflect.get(
      Reflect.get(acquisition, 'props'),
      'replicaRuntime',
    );
    if (
      serviceReplicaRuntime === null ||
      typeof serviceReplicaRuntime !== 'object' ||
      typeof Reflect.get(serviceReplicaRuntime, 'fanoutReplacement') !==
        'function'
    ) {
      throw new Error('service replica runtime missing');
    }
    await serviceReplicaRuntime.fanoutReplacement(
      await serviceReplicaRuntime.getSnapshot(),
    );
    await vi.waitFor(() =>
      expect(serviceReplicaRuntime.activeRegistrationCount()).toBe(0),
    );
    const releasedDiagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listServiceFrontendReplicas()),
    );
    expect(releasedDiagnostics).toMatchObject([
      { activeRegistrationCount: 0, socketState: 'disconnected' },
    ]);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    await Effect.runPromise(decodeRpc(await acquisition.release()));
    expect(frontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    const serviceReplicaRuntimes = Reflect.get(
      Reflect.get(userReplicaApi, 'props'),
      'serviceReplicaRuntimes',
    );
    if (!(serviceReplicaRuntimes instanceof Map)) {
      throw new Error('service replica runtime map missing');
    }
    serviceReplicaRuntimes.clear();
    const offlineAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireServiceFrontendReplica({
          serviceName: serviceFrontend.serviceName,
          frontendName: serviceFrontend.frontendName,
          serviceFrontendLockKey,
          serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
          frontendSpec: serviceFrontendSpec,
          mode: 'existing-only',
          sink,
        }),
      ),
    );
    const offlineState = await Effect.runPromise(
      decodeRpc(await offlineAcquisition.getState()),
    );
    expect(offlineState.serviceFrontendLockKey).toBe(serviceFrontendLockKey);
    expect(authority.getState).toHaveBeenCalledTimes(1);
    expect(
      partitionDatabase.exec(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'aggregateFrontendCommandJournal'",
      )[0]?.values,
    ).toEqual([[0]]);

    const ticketsBeforeOnlineReplacement =
      authority.createWebSocketTicket.mock.calls.length;
    const onlineAfterOfflineAcquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireServiceFrontendReplica({
          serviceName: serviceFrontend.serviceName,
          frontendName: serviceFrontend.frontendName,
          serviceFrontendLockKey,
          serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
          frontendSpec: serviceFrontendSpec,
          mode: 'online',
          sink,
        }),
      ),
    );
    const onlineAfterOfflineState = await Effect.runPromise(
      decodeRpc(await onlineAfterOfflineAcquisition.getState()),
    );
    expect(authority.getState).toHaveBeenCalledTimes(2);
    expect(onlineAfterOfflineState).toMatchObject({
      frontendIndex: serviceState.frontendIndex,
      replicaIndex: 3,
      resources: serviceState.resources,
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(authority.createWebSocketTicket.mock.calls.length).toBeGreaterThan(
        ticketsBeforeOnlineReplacement,
      ),
    );
    expect(authority.getState.mock.invocationCallOrder[1]).toBeLessThan(
      authority.createWebSocketTicket.mock.invocationCallOrder[
        ticketsBeforeOnlineReplacement
      ] ?? Number.POSITIVE_INFINITY,
    );

    await Effect.runPromise(decodeRpc(await offlineAcquisition.release()));
    await Effect.runPromise(
      decodeRpc(await onlineAfterOfflineAcquisition.release()),
    );
    serviceReplicaRuntimes.clear();
    serviceDatabase.run(
      'ALTER TABLE serviceFrontendReplicaMetadata ADD COLUMN state text',
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.acquireServiceFrontendReplica({
            serviceName: serviceFrontend.serviceName,
            frontendName: serviceFrontend.frontendName,
            serviceFrontendLockKey,
            serviceFrontendLock: serviceFrontendSpec.serviceFrontendLock,
            frontendSpec: serviceFrontendSpec,
            mode: 'existing-only',
            sink,
          }),
        ),
      ),
    ).rejects.toThrow('browser-persistence-reset-required');
    expect(
      serviceDatabase
        .exec("PRAGMA table_info('serviceFrontendReplicaMetadata')")[0]
        ?.values.map(row => row[1]),
    ).toEqual([
      'id',
      'systemVersion',
      'frontendIndex',
      'replicaIndex',
      'state',
    ]);
    systemApi[Symbol.dispose]();
    expect(frontendApi[Symbol.dispose]).toHaveBeenCalledTimes(2);
    channel.port1.close();
    channel.port2.close();
  });

  it('commits a socket block while a push response is held and reconciles the late response without reapplying', async () => {
    const pushResponse = Promise.withResolvers<void>();
    const command = Schema.validateSync(StagedSessionCommandSchema)({
      id: 'cmd_socket_before_push_response',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: aggregateState.systemVersion,
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId: aggregateState.aggregateId,
      aggregateName: aggregateState.aggregateName,
      frontendName: aggregateState.frontendName,
      userId: aggregateState.userId,
      sessionId: 'sesn_socket_before_push_response',
      stagedCursor: 'stcur_socket_before_push_response',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const executedCommand = Schema.validateSync(ExecutedPushedCommandSchema)({
      ...command,
      replicaIndex: 1,
      pushedAt: new Date('2026-01-01T00:00:01.123Z'),
      pushedCursor: 'pcur_socket_before_push_response',
      mode: 'optimistic-lww',
      aggregateCursor: 'acur_socket_before_push_response',
      aggregateIndex: 1,
      executedAt: new Date('2026-01-01T00:00:02.123Z'),
      status: 'executed',
    });
    const authority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-socket-before-push-response' }),
      ),
      pushCommands: vi.fn(async () => {
        await pushResponse.promise;
        return encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [executedCommand],
          failedStagedCommands: [],
          failedPushedCommands: [],
        });
      }),
    };
    const frontendApi = makeAggregateFrontendApi(authority);
    const sink = makeAggregateSink();
    const mutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedAggregateFrontendMutationSchema),
    )([
      {
        commandId: command.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_socket_before_push_response',
        operationName: 'create',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Socket committed first' },
        }),
      },
    ]);

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: frontendApi,
      }),
    );
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getState()));
    await vi.waitFor(() => expect(webSocketInstances).toHaveLength(1));

    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.stageAggregateFrontendCommand({
            target: {
              aggregateId: command.aggregateId,
              aggregateName: command.aggregateName,
              frontendName: command.frontendName,
              aggregateFrontendLockKey,
            },
            sessionIndex: 1,
            command,
            mutations,
          }),
        ),
      ),
    ).resolves.toEqual({ commandId: command.id });
    const stagedState = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    const optimisticResource = stagedState.resources.find(
      resource => resource.id === 'acct_socket_before_push_response',
    );
    if (optimisticResource === undefined) {
      throw new Error('optimistic resource missing');
    }

    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(authority.pushCommands).toHaveBeenCalledTimes(1),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
      ),
    ).resolves.toMatchObject([{ pushInFlight: true }]);

    const socket = webSocketInstances[0];
    if (socket === undefined) throw new Error('aggregate socket missing');
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'aggregateFrontendBlock',
          sync: {
            frontendName: aggregateState.frontendName,
            lastAggregateCursor: executedCommand.aggregateCursor,
            frontendIndex: 1,
            delta: {
              inserted: [optimisticResource],
              updated: [],
              deleted: [],
            },
            pendingPushedCommands: [],
            executedPushedCommands: [executedCommand],
            failedPushedCommands: [],
          },
        }),
      }),
    );
    await vi.waitFor(async () => {
      const current = await Effect.runPromise(
        decodeRpc(await acquisition.getState()),
      );
      expect(current.frontendIndex).toBe(1);
      expect(current.stagedCommands).toEqual([]);
      expect(current.pushedCommands).toEqual([]);
      expect(current.executedPushedCommands).toEqual([]);
      expect(current.resources.map(resource => resource.id)).toEqual([
        optimisticResource.id,
      ]);
    });
    const stateAfterSocket = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    const blockCountAfterSocket = sink.handleBlock.mock.calls.length;

    pushResponse.resolve();
    await vi.waitFor(async () => {
      const current = await Effect.runPromise(
        decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
      );
      expect(current[0]?.pushInFlight).toBe(false);
    });
    const settledState = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    expect(settledState.replicaIndex).toBe(stateAfterSocket.replicaIndex);
    expect(settledState.resources).toEqual(stateAfterSocket.resources);
    expect(settledState.executedPushedCommands).toEqual([]);
    expect(sink.handleBlock).toHaveBeenCalledTimes(blockCountAfterSocket);
    expect(authority.pushCommands).toHaveBeenCalledTimes(1);

    const diagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    const diagnostic = diagnostics[0];
    if (diagnostic === undefined) {
      throw new Error('aggregate diagnostic missing');
    }
    const aggregateDatabase = databaseClients.get(
      `zerospin/056/sys_1/users/user_1/aggregate/${diagnostic.databaseName}`,
    );
    if (aggregateDatabase === undefined) {
      throw new Error('aggregate database missing');
    }
    expect(
      aggregateDatabase.exec(
        "SELECT COUNT(*) FROM aggregateFrontendCommandJournal WHERE commandId = 'cmd_socket_before_push_response'",
      )[0]?.values,
    ).toEqual([[0]]);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('discards a late parent-A push result and completes the same push through parent B', async () => {
    const parentAPushEntered = Promise.withResolvers<void>();
    const parentAPushResponse = Promise.withResolvers<void>();
    const command = Schema.validateSync(StagedSessionCommandSchema)({
      id: 'cmd_exact_parent_push_fence',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: aggregateState.systemVersion,
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId: aggregateState.aggregateId,
      aggregateName: aggregateState.aggregateName,
      frontendName: aggregateState.frontendName,
      userId: aggregateState.userId,
      sessionId: 'sesn_exact_parent_push_fence',
      stagedCursor: 'stcur_exact_parent_push_fence',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const parentAAuthority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-exact-parent-a' }),
      ),
      pushCommands: vi.fn(async commands => {
        parentAPushEntered.resolve();
        await parentAPushResponse.promise;
        return encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: commands.map(stagedCommand => ({
            ...stagedCommand,
            pushedAt: new Date('2026-01-01T00:00:01.123Z'),
            pushedCursor: `pcur_parent_a_${stagedCommand.id}`,
            status: 'pushed',
          })),
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        });
      }),
    };
    const parentBAuthority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-exact-parent-b' }),
      ),
      pushCommands: vi.fn(async commands =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: commands.map(stagedCommand => ({
            ...stagedCommand,
            pushedAt: new Date('2026-01-01T00:00:02.123Z'),
            pushedCursor: `pcur_parent_b_${stagedCommand.id}`,
            status: 'pushed',
          })),
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const parentAFrontendApi = makeAggregateFrontendApi(parentAAuthority);
    const parentBFrontendApi = makeAggregateFrontendApi(parentBAuthority);
    const parentAAuthenticatedApi = makeAuthenticatedApi({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      aggregateFrontendApi: parentAFrontendApi,
    });
    const parentBAuthenticatedApi = makeAuthenticatedApi({
      systemId: aggregateState.systemId,
      userId: aggregateState.userId,
      aggregateFrontendApi: parentBFrontendApi,
    });
    const sink = makeAggregateSink();

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const request = makePartitionRequest(parentAAuthenticatedApi);
    const userPartition = await Effect.runPromise(
      decodeRpc(await systemApi.getUserPartitionRepo(request)),
    );
    const userReplicaApi = userPartition.api;
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getState()));
    await vi.advanceTimersByTimeAsync(0);
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.setPushPaused({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          pushPaused: true,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: command.aggregateId,
            aggregateName: command.aggregateName,
            frontendName: command.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 1,
          command,
          mutations: [],
        }),
      ),
    );
    const stateBeforeParentAResult = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    const blockCountBeforeParentAResult = sink.handleBlock.mock.calls.length;
    const diagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    const diagnostic = diagnostics[0];
    if (diagnostic === undefined) {
      throw new Error('aggregate diagnostic missing');
    }
    const aggregateDatabase = databaseClients.get(
      `zerospin/056/sys_1/users/user_1/aggregate/${diagnostic.databaseName}`,
    );
    if (aggregateDatabase === undefined) {
      throw new Error('aggregate database missing');
    }
    const stagedJournalRow = aggregateDatabase.exec(
      `SELECT command FROM aggregateFrontendCommandJournal WHERE commandId = '${command.id}'`,
    )[0]?.values;
    expect(stagedJournalRow).toEqual([[expect.any(String)]]);

    const parentAPush = userReplicaApi
      .pushNow({
        aggregateId: aggregateState.aggregateId,
        aggregateName: aggregateState.aggregateName,
        frontendName: aggregateState.frontendName,
        aggregateFrontendLockKey,
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await parentAPushEntered.promise;

    const userReplicaProps = Reflect.get(userReplicaApi, 'props');
    const getAuthenticatedApi = Reflect.get(
      userReplicaProps,
      'getAuthenticatedApi',
    );
    const getCurrentAuthenticatedApi = Reflect.get(
      userReplicaProps,
      'getCurrentAuthenticatedApi',
    );
    if (
      typeof getAuthenticatedApi !== 'function' ||
      typeof getCurrentAuthenticatedApi !== 'function'
    ) {
      throw new Error('bound root acquisition missing');
    }
    const parentA = getCurrentAuthenticatedApi();
    if (parentA === null) throw new Error('parent A missing');
    const [authenticationToken] = authenticatedApisByToken.keys();
    if (authenticationToken === undefined) {
      throw new Error('authentication token missing');
    }
    authenticatedApisByToken.set(authenticationToken, parentBAuthenticatedApi);
    const replacement = await getAuthenticatedApi({
      freshness: 'force',
      failedAuthenticatedApi: parentA,
    });
    const parentB = Reflect.get(replacement, 'authenticatedApi');
    expect(parentB).not.toBe(parentA);
    expect(getCurrentAuthenticatedApi()).toBe(parentB);

    parentAPushResponse.resolve();
    await expect(parentAPush).resolves.toEqual({ status: 'pushed' });
    expect(
      await Effect.runPromise(decodeRpc(await acquisition.getState())),
    ).toEqual(stateBeforeParentAResult);
    expect(sink.handleBlock).toHaveBeenCalledTimes(
      blockCountBeforeParentAResult,
    );
    expect(
      aggregateDatabase.exec(
        `SELECT command FROM aggregateFrontendCommandJournal WHERE commandId = '${command.id}'`,
      )[0]?.values,
    ).toEqual(stagedJournalRow);
    expect(parentAAuthority.pushCommands).toHaveBeenCalledOnce();
    expect(parentBAuthority.pushCommands).toHaveBeenCalledOnce();
    expect(parentBAuthority.pushCommands.mock.calls[0]?.[0]).toEqual(
      parentAAuthority.pushCommands.mock.calls[0]?.[0],
    );
    expect(parentAFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    const stateAfterParentBRetry = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    expect(stateAfterParentBRetry.stagedCommands).toMatchObject([
      { id: command.id, replicaIndex: 1 },
    ]);
    expect(stateAfterParentBRetry.pushedCommands).toEqual([]);
    const committedJournalRow = aggregateDatabase.exec(
      `SELECT command FROM aggregateFrontendCommandJournal WHERE commandId = '${command.id}'`,
    )[0]?.values;
    expect(committedJournalRow).toEqual(stagedJournalRow);
    expect(JSON.parse(String(committedJournalRow?.[0]?.[0]))).toMatchObject({
      id: command.id,
      pushedCursor: null,
      replicaIndex: 1,
      status: 'staged',
    });

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    expect(parentBFrontendApi[Symbol.dispose]).toHaveBeenCalledOnce();
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('pauses one target and bounds each byte-identical transport retry schedule before a later wake', async () => {
    let transportFailuresRemaining = 0;
    let shouldBlockPush = false;
    let pushBarrier = Promise.withResolvers<void>();
    const authority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-control' }),
      ),
      pushCommands: vi.fn(async commands => {
        if (transportFailuresRemaining > 0) {
          transportFailuresRemaining -= 1;
          throw new Error('injected worker-to-server transport failure');
        }
        if (shouldBlockPush) await pushBarrier.promise;
        return encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: commands.map(command =>
            Schema.validateSync(FailedStagedReplicaCommandSchema)({
              ...command,
              failedAt: new Date('2026-01-01T00:00:01.123Z'),
              failure: 'Settled by the push-control fixture',
              status: 'failed',
            }),
          ),
          failedPushedCommands: [],
        });
      }),
    };
    const frontendApi = makeAggregateFrontendApi(authority);
    const sink = makeAggregateSink();
    const firstCommand = Schema.validateSync(StagedSessionCommandSchema)({
      id: 'cmd_control_first',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: aggregateState.systemVersion,
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId: aggregateState.aggregateId,
      aggregateName: aggregateState.aggregateName,
      frontendName: aggregateState.frontendName,
      userId: aggregateState.userId,
      sessionId: 'sesn_control_first',
      stagedCursor: 'stcur_control_first',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const secondCommand = Schema.validateSync(StagedSessionCommandSchema)({
      ...firstCommand,
      id: 'cmd_control_second',
      sessionId: 'sesn_control_second',
      stagedCursor: 'stcur_control_second',
    });
    const retryCommand = Schema.validateSync(StagedSessionCommandSchema)({
      ...firstCommand,
      id: 'cmd_control_retry',
      sessionId: 'sesn_control_retry',
      stagedCursor: 'stcur_control_retry',
    });
    const retryExhaustedCommand = Schema.validateSync(
      StagedSessionCommandSchema,
    )({
      ...firstCommand,
      id: 'cmd_control_retry_exhausted',
      sessionId: 'sesn_control_retry_exhausted',
      stagedCursor: 'stcur_control_retry_exhausted',
    });
    const busyCommand = Schema.validateSync(StagedSessionCommandSchema)({
      ...firstCommand,
      id: 'cmd_control_busy',
      sessionId: 'sesn_control_busy',
      stagedCursor: 'stcur_control_busy',
    });

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: frontendApi,
      }),
    );
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getState()));

    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.setPushPaused({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          pushPaused: true,
        }),
      ),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.getPushPaused({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).resolves.toBe(true);
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.stageAggregateFrontendCommand({
            target: {
              aggregateId: firstCommand.aggregateId,
              aggregateName: firstCommand.aggregateName,
              frontendName: firstCommand.frontendName,
              aggregateFrontendLockKey,
            },
            sessionIndex: 1,
            command: firstCommand,
            mutations: [],
          }),
        ),
      ),
    ).resolves.toEqual({ commandId: firstCommand.id });
    await vi.advanceTimersByTimeAsync(0);
    expect(authority.pushCommands).not.toHaveBeenCalled();

    shouldBlockPush = true;
    const firstManualPush = userReplicaApi
      .pushNow({
        aggregateId: aggregateState.aggregateId,
        aggregateName: aggregateState.aggregateName,
        frontendName: aggregateState.frontendName,
        aggregateFrontendLockKey,
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await vi.waitFor(() =>
      expect(authority.pushCommands).toHaveBeenCalledTimes(1),
    );
    const laterStage = userReplicaApi
      .stageAggregateFrontendCommand({
        target: {
          aggregateId: secondCommand.aggregateId,
          aggregateName: secondCommand.aggregateName,
          frontendName: secondCommand.frontendName,
          aggregateFrontendLockKey,
        },
        sessionIndex: 1,
        command: secondCommand,
        mutations: [],
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    pushBarrier.resolve();
    shouldBlockPush = false;
    await expect(firstManualPush).resolves.toEqual({ status: 'pushed' });
    await expect(laterStage).resolves.toEqual({ commandId: secondCommand.id });
    await vi.advanceTimersByTimeAsync(0);
    expect(authority.pushCommands).toHaveBeenCalledTimes(1);

    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).resolves.toEqual({ status: 'pushed' });
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).resolves.toEqual({ status: 'empty' });

    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.setPushPaused({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          pushPaused: false,
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-frontend-push-not-paused');

    pushBarrier = Promise.withResolvers<void>();
    shouldBlockPush = true;
    const pushCallsBeforeBusy = authority.pushCommands.mock.calls.length;
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: busyCommand.aggregateId,
            aggregateName: busyCommand.aggregateName,
            frontendName: busyCommand.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 2,
          command: busyCommand,
          mutations: [],
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(authority.pushCommands).toHaveBeenCalledTimes(
        pushCallsBeforeBusy + 1,
      ),
    );
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.setPushPaused({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          pushPaused: true,
        }),
      ),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-frontend-push-in-flight');
    await expect(
      Effect.runPromise(
        decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
      ),
    ).resolves.toMatchObject([{ pushInFlight: true }]);
    pushBarrier.resolve();
    shouldBlockPush = false;
    await vi.waitFor(async () => {
      const current = await Effect.runPromise(
        decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
      );
      expect(current[0]?.pushInFlight).toBe(false);
    });
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.setPushPaused({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          pushPaused: false,
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);

    transportFailuresRemaining = 3;
    const automaticRetryStart = authority.pushCommands.mock.calls.length;
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: retryCommand.aggregateId,
            aggregateName: retryCommand.aggregateName,
            frontendName: retryCommand.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 2,
          command: retryCommand,
          mutations: [],
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(750);
    await vi.waitFor(() =>
      expect(authority.pushCommands).toHaveBeenCalledTimes(
        automaticRetryStart + 4,
      ),
    );
    expect(
      authority.pushCommands.mock.calls
        .slice(automaticRetryStart)
        .map(([commands]) =>
          commands.map(command => ({
            id: command.id,
            replicaIndex: command.replicaIndex,
          })),
        ),
    ).toEqual([
      [{ id: retryCommand.id, replicaIndex: 7 }],
      [{ id: retryCommand.id, replicaIndex: 7 }],
      [{ id: retryCommand.id, replicaIndex: 7 }],
      [{ id: retryCommand.id, replicaIndex: 7 }],
    ]);

    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.setPushPaused({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          pushPaused: true,
        }),
      ),
    );
    await vi.waitFor(async () => {
      const current = await Effect.runPromise(
        decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
      );
      expect(current[0]?.pushInFlight).toBe(false);
    });
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: retryExhaustedCommand.aggregateId,
            aggregateName: retryExhaustedCommand.aggregateName,
            frontendName: retryExhaustedCommand.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 2,
          command: retryExhaustedCommand,
          mutations: [],
        }),
      ),
    );
    transportFailuresRemaining = 6;
    const retryExhaustedStart = authority.pushCommands.mock.calls.length;
    const retryExhaustedPush = userReplicaApi
      .pushNow({
        aggregateId: aggregateState.aggregateId,
        aggregateName: aggregateState.aggregateName,
        frontendName: aggregateState.frontendName,
        aggregateFrontendLockKey,
      })
      .then(encoded => Effect.runPromise(decodeRpc(encoded)));
    await vi.waitFor(() =>
      expect(authority.pushCommands).toHaveBeenCalledTimes(
        retryExhaustedStart + 1,
      ),
    );
    await vi.advanceTimersByTimeAsync(750);
    await vi.waitFor(() =>
      expect(authority.pushCommands).toHaveBeenCalledTimes(
        retryExhaustedStart + 4,
      ),
    );
    await vi.advanceTimersByTimeAsync(750);
    await expect(retryExhaustedPush).resolves.toMatchObject({
      status: 'retry-exhausted',
    });
    expect(
      authority.pushCommands.mock.calls
        .slice(retryExhaustedStart)
        .map(([commands]) =>
          commands.map(command => ({
            id: command.id,
            replicaIndex: command.replicaIndex,
          })),
        ),
    ).toEqual(
      Array.from({ length: 6 }, () => [
        { id: retryExhaustedCommand.id, replicaIndex: 9 },
      ]),
    );
    transportFailuresRemaining = 0;
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).resolves.toEqual({ status: 'pushed' });
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.getPushPaused({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).resolves.toBe(true);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('validates the complete PushBlock before atomically settling both failed-stage variants', async () => {
    const authority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-push-block-validation' }),
      ),
      pushCommands: vi.fn(),
    };
    const frontendApi = makeAggregateFrontendApi(authority);
    const sink = makeAggregateSink();
    const firstCommand = Schema.validateSync(StagedSessionCommandSchema)({
      id: 'cmd_push_block_validation_first',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: aggregateState.systemVersion,
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId: aggregateState.aggregateId,
      aggregateName: aggregateState.aggregateName,
      frontendName: aggregateState.frontendName,
      userId: aggregateState.userId,
      sessionId: 'sesn_push_block_validation_first',
      stagedCursor: 'stcur_push_block_validation_first',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const secondCommand = Schema.validateSync(StagedSessionCommandSchema)({
      ...firstCommand,
      id: 'cmd_push_block_validation_second',
      sessionId: 'sesn_push_block_validation_second',
      stagedCursor: 'stcur_push_block_validation_second',
    });
    const informationalCommand = Schema.validateSync(
      StagedSessionCommandSchema,
    )({
      ...firstCommand,
      id: 'cmd_push_block_validation_informational',
      sessionId: 'sesn_push_block_validation_informational',
      stagedCursor: 'stcur_push_block_validation_informational',
    });

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: frontendApi,
      }),
    );
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getState()));
    await vi.advanceTimersByTimeAsync(0);
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.setPushPaused({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          pushPaused: true,
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 1,
          command: firstCommand,
          mutations: [],
        }),
      ),
    );
    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 1,
          command: secondCommand,
          mutations: [],
        }),
      ),
    );
    const stateBeforeMalformedResults = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    const blockCountBeforeMalformedResults = sink.handleBlock.mock.calls.length;
    const replacementCountBeforeMalformedResults =
      sink.replaceState.mock.calls.length;

    authority.pushCommands.mockImplementationOnce(async () =>
      encodeRight({
        writeIndex: 1,
        guardedAtAggregateCursor: null,
        pendingCommands: [],
        pushedCommands: [],
        executedCommands: [],
        failedStagedCommands: [],
        failedPushedCommands: [],
      }),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-command-push-response-conflict');

    authority.pushCommands.mockImplementationOnce(async commands =>
      encodeRight({
        writeIndex: 2,
        guardedAtAggregateCursor: null,
        pendingCommands: [],
        pushedCommands: [
          {
            ...commands[0],
            id: 'cmd_push_block_validation_unknown',
            pushedAt: new Date('2026-01-01T00:00:01.123Z'),
            pushedCursor: 'pcur_push_block_validation_unknown',
            status: 'pushed',
          },
        ],
        executedCommands: [],
        failedStagedCommands: [],
        failedPushedCommands: [],
      }),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-command-push-response-conflict');

    authority.pushCommands.mockImplementationOnce(async commands => {
      const pushed = {
        ...commands[0],
        pushedAt: new Date('2026-01-01T00:00:01.123Z'),
        pushedCursor: 'pcur_push_block_validation_duplicate',
        status: 'pushed',
      };
      return encodeRight({
        writeIndex: 3,
        guardedAtAggregateCursor: null,
        pendingCommands: [pushed],
        pushedCommands: [
          pushed,
          {
            ...commands[1],
            pushedAt: new Date('2026-01-01T00:00:01.123Z'),
            pushedCursor: 'pcur_push_block_validation_second',
            status: 'pushed',
          },
        ],
        executedCommands: [],
        failedStagedCommands: [],
        failedPushedCommands: [],
      });
    });
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-command-push-response-conflict');

    authority.pushCommands.mockImplementationOnce(async commands =>
      encodeRight({
        writeIndex: 4,
        guardedAtAggregateCursor: null,
        pendingCommands: [],
        pushedCommands: commands.map(command => ({
          ...command,
          ...(command.id === firstCommand.id
            ? { payload: '{"changed":true}' }
            : {}),
          pushedAt: new Date('2026-01-01T00:00:01.123Z'),
          pushedCursor: `pcur_${command.id}`,
          status: 'pushed',
        })),
        executedCommands: [],
        failedStagedCommands: [],
        failedPushedCommands: [],
      }),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-command-push-response-bytes-conflict');

    await expect(
      Effect.runPromise(decodeRpc(await acquisition.getState())),
    ).resolves.toEqual(stateBeforeMalformedResults);
    expect(sink.handleBlock).toHaveBeenCalledTimes(
      blockCountBeforeMalformedResults,
    );
    expect(sink.replaceState).toHaveBeenCalledTimes(
      replacementCountBeforeMalformedResults,
    );

    authority.pushCommands.mockImplementationOnce(async commands =>
      encodeRight({
        writeIndex: 5,
        guardedAtAggregateCursor: null,
        pendingCommands: [],
        pushedCommands: [],
        executedCommands: [],
        failedStagedCommands: [
          Schema.validateSync(FailedStagedReplicaCommandSchema)({
            ...commands[0],
            failedAt: new Date('2026-01-01T00:00:02.123Z'),
            failure: 'Rejected before finalization',
            status: 'failed',
          }),
          Schema.validateSync(FinalizedFailedStagedReplicaCommandSchema)({
            ...commands[1],
            aggregateCursor: 'acur_push_block_validation_finalized',
            aggregateIndex: 1,
            failedAt: new Date('2026-01-01T00:00:03.123Z'),
            failure: 'Rejected during finalization',
            status: 'failed',
          }),
        ],
        failedPushedCommands: [],
      }),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).resolves.toEqual({ status: 'pushed' });
    await expect(
      Effect.runPromise(decodeRpc(await acquisition.getState())),
    ).resolves.toMatchObject({
      replicaIndex: 3,
      stagedCommands: [],
      pushedCommands: [],
      failedStagedCommands: [],
    });
    expect(sink.replaceState).toHaveBeenCalledTimes(
      replacementCountBeforeMalformedResults + 1,
    );
    expect(sink.replaceState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        replicaIndex: 3,
        failedStagedCommands: [
          expect.objectContaining({ id: firstCommand.id }),
          expect.objectContaining({
            id: secondCommand.id,
            aggregateCursor: 'acur_push_block_validation_finalized',
          }),
        ],
      }),
    );

    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.stageAggregateFrontendCommand({
          target: {
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          },
          sessionIndex: 1,
          command: informationalCommand,
          mutations: [],
        }),
      ),
    );
    const stateBeforeInformationalResult = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    const blockCountBeforeInformationalResult =
      sink.handleBlock.mock.calls.length;
    const replacementCountBeforeInformationalResult =
      sink.replaceState.mock.calls.length;
    authority.pushCommands.mockImplementationOnce(async commands =>
      encodeRight({
        writeIndex: 6,
        guardedAtAggregateCursor: null,
        pendingCommands: [],
        pushedCommands: commands.map(command => ({
          ...command,
          pushedAt: new Date('2026-01-01T00:00:04.123Z'),
          pushedCursor: `pcur_${command.id}`,
          status: 'pushed',
        })),
        executedCommands: [],
        failedStagedCommands: [],
        failedPushedCommands: [],
      }),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.pushNow({
            aggregateId: aggregateState.aggregateId,
            aggregateName: aggregateState.aggregateName,
            frontendName: aggregateState.frontendName,
            aggregateFrontendLockKey,
          }),
        ),
      ),
    ).resolves.toEqual({ status: 'pushed' });
    await expect(
      Effect.runPromise(decodeRpc(await acquisition.getState())),
    ).resolves.toEqual(stateBeforeInformationalResult);
    expect(sink.handleBlock).toHaveBeenCalledTimes(
      blockCountBeforeInformationalResult,
    );
    expect(sink.replaceState).toHaveBeenCalledTimes(
      replacementCountBeforeInformationalResult,
    );

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('rejects a failed optimistic application atomically and accepts the next exact-lock stage', async () => {
    const authority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({ ticket: 'ticket-materialization-repair' }),
      ),
      pushCommands: vi.fn(async commands =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: commands.map(command =>
            Schema.validateSync(FailedStagedReplicaCommandSchema)({
              ...command,
              failedAt: new Date('2026-01-01T00:00:01.123Z'),
              failure: 'Settled after the valid follow-up stage',
              status: 'failed',
            }),
          ),
          failedPushedCommands: [],
        }),
      ),
    };
    const frontendApi = makeAggregateFrontendApi(authority);
    const sink = makeAggregateSink();
    const failedMaterializationCommand = Schema.validateSync(
      StagedSessionCommandSchema,
    )({
      id: 'cmd_materialization_repair',
      commandName: 'updateList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: aggregateState.systemVersion,
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId: aggregateState.aggregateId,
      aggregateName: aggregateState.aggregateName,
      frontendName: aggregateState.frontendName,
      userId: aggregateState.userId,
      sessionId: 'sesn_materialization_repair',
      stagedCursor: 'stcur_materialization_repair',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const laterCommand = Schema.validateSync(StagedSessionCommandSchema)({
      ...failedMaterializationCommand,
      id: 'cmd_materialization_repair_later',
      stagedCursor: 'stcur_materialization_repair_later',
    });
    const failedMaterializationMutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedAggregateFrontendMutationSchema),
    )([
      {
        commandId: failedMaterializationCommand.id,
        mutationIndex: 0,
        modelName: 'account',
        modelVersion: '1.0.0',
        resourceId: 'acct_missing_for_repair',
        operationName: 'update',
        operation: JSON.stringify({
          encodedAttributes: { name: 'Cannot update a missing resource' },
        }),
      },
    ]);

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: frontendApi,
      }),
    );
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getState()));

    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.stageAggregateFrontendCommand({
            target: {
              aggregateId: failedMaterializationCommand.aggregateId,
              aggregateName: failedMaterializationCommand.aggregateName,
              frontendName: failedMaterializationCommand.frontendName,
              aggregateFrontendLockKey,
            },
            sessionIndex: 1,
            command: failedMaterializationCommand,
            mutations: failedMaterializationMutations,
          }),
        ),
      ),
    ).rejects.toThrow();
    expect(authority.pushCommands).not.toHaveBeenCalled();

    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.stageAggregateFrontendCommand({
            target: {
              aggregateId: laterCommand.aggregateId,
              aggregateName: laterCommand.aggregateName,
              frontendName: laterCommand.frontendName,
              aggregateFrontendLockKey,
            },
            sessionIndex: 2,
            command: laterCommand,
            mutations: [],
          }),
        ),
      ),
    ).resolves.toEqual({ commandId: laterCommand.id });
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() =>
      expect(authority.pushCommands).toHaveBeenCalledTimes(1),
    );
    const diagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    const diagnostic = diagnostics[0];
    if (diagnostic === undefined) {
      throw new Error('aggregate diagnostic missing');
    }
    const aggregateDatabase = databaseClients.get(
      `zerospin/056/sys_1/users/user_1/aggregate/${diagnostic.databaseName}`,
    );
    if (aggregateDatabase === undefined) {
      throw new Error('aggregate database missing');
    }
    expect(
      aggregateDatabase.exec(
        'SELECT COUNT(*) FROM aggregateFrontendCommandJournal',
      )[0]?.values,
    ).toEqual([[0]]);
    expect(
      aggregateDatabase.exec(
        'SELECT replicaIndex FROM aggregateFrontendReplicaMetadata',
      )[0]?.values,
    ).toEqual([[2]]);

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });

  it('serializes exact-lock stages and retains idempotent atomic receipts without double application', async () => {
    const authority = {
      getState: vi.fn(async () => encodeRight(aggregateState)),
      createWebSocketTicket: vi.fn(async () =>
        encodeRight({
          ticket: 'ticket-queue',
        }),
      ),
      pushCommands: vi.fn(async () =>
        encodeRight({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        }),
      ),
    };
    const frontendApi = makeAggregateFrontendApi(authority);
    const sink = makeAggregateSink();
    const firstCommand = Schema.validateSync(StagedSessionCommandSchema)({
      id: 'cmd_queue_first',
      commandName: 'createList',
      payload: '{}',
      systemName: main.systemName,
      systemVersion: aggregateState.systemVersion,
      contractVersion: '1.0.0',
      commandType: 'frontend',
      aggregateId: aggregateState.aggregateId,
      aggregateName: aggregateState.aggregateName,
      frontendName: aggregateState.frontendName,
      userId: aggregateState.userId,
      sessionId: 'sesn_queue',
      stagedCursor: 'stcur_queue_1',
      stagedAt: new Date('2026-01-01T00:00:00.123Z'),
      pushedCursor: null,
      status: 'staged',
    });
    const secondCommand = Schema.validateSync(StagedSessionCommandSchema)({
      ...firstCommand,
      id: 'cmd_queue_second',
      sessionId: 'sesn_queue_second',
      stagedCursor: 'stcur_queue_2',
    });
    const firstMutations = Schema.decodeUnknownSync(
      Schema.Array(EncodedAggregateFrontendMutationSchema),
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
      Schema.Array(EncodedAggregateFrontendMutationSchema),
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

    const { startSharedWorker } = await import('./startSharedWorker.js');
    startSharedWorker();
    const connect = connectListeners.get('connect');
    if (connect === undefined) throw new Error('connect listener missing');
    const channel = new MessageChannel();
    connect(new MessageEvent('connect', { ports: [channel.port1] }));
    const systemApi = systemApis.get(0);
    if (systemApi === undefined) throw new Error('system api missing');
    const userReplicaApi = await openUserPartition(
      systemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: frontendApi,
      }),
    );
    const acquisition = await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: aggregateFrontendSpec.aggregateFrontendLock,
          frontendSpec: aggregateFrontendSpec,
          mode: 'online',
          sink,
        }),
      ),
    );
    await Effect.runPromise(decodeRpc(await acquisition.getState()));

    const unregisteredChannel = new MessageChannel();
    connect(
      new MessageEvent('connect', { ports: [unregisteredChannel.port1] }),
    );
    const unregisteredSystemApi = systemApis.get(1);
    if (unregisteredSystemApi === undefined) {
      throw new Error('unregistered system api missing');
    }
    const unregisteredUserPartitionRepo = await openUserPartition(
      unregisteredSystemApi,
      makeAuthenticatedApi({
        systemId: aggregateState.systemId,
        userId: aggregateState.userId,
        aggregateFrontendApi: makeAggregateFrontendApi(authority),
      }),
    );
    await expect(
      Effect.runPromise(
        decodeRpc(
          await unregisteredUserPartitionRepo.stageAggregateFrontendCommand({
            target: {
              aggregateId: aggregateState.aggregateId,
              aggregateName: aggregateState.aggregateName,
              frontendName: aggregateState.frontendName,
              aggregateFrontendLockKey,
            },
            sessionIndex: 1,
            command: firstCommand,
            mutations: firstMutations,
          }),
        ),
      ),
    ).rejects.toThrow('aggregate-frontend-replica-stage-capability-missing');

    await Effect.runPromise(
      decodeRpc(
        await userReplicaApi.setPushPaused({
          aggregateId: aggregateState.aggregateId,
          aggregateName: aggregateState.aggregateName,
          frontendName: aggregateState.frontendName,
          aggregateFrontendLockKey,
          pushPaused: true,
        }),
      ),
    );

    const firstStage = userReplicaApi.stageAggregateFrontendCommand({
      target: {
        aggregateId: aggregateState.aggregateId,
        aggregateName: aggregateState.aggregateName,
        frontendName: aggregateState.frontendName,
        aggregateFrontendLockKey,
      },
      sessionIndex: 1,
      command: firstCommand,
      mutations: firstMutations,
    });
    const secondStage = userReplicaApi.stageAggregateFrontendCommand({
      target: {
        aggregateId: aggregateState.aggregateId,
        aggregateName: aggregateState.aggregateName,
        frontendName: aggregateState.frontendName,
        aggregateFrontendLockKey,
      },
      sessionIndex: 1,
      command: secondCommand,
      mutations: secondMutations,
    });
    const firstResult = Effect.runPromise(decodeRpc(await firstStage));
    const secondResult = Effect.runPromise(decodeRpc(await secondStage));
    const results = await Promise.allSettled([firstResult, secondResult]);

    expect(results[0]).toMatchObject({
      status: 'fulfilled',
      value: { commandId: firstCommand.id },
    });
    expect(results[1]).toMatchObject({
      status: 'fulfilled',
      value: { commandId: secondCommand.id },
    });
    const state = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    expect(state.replicaIndex).toBe(2);
    expect(state.stagedCommands.map(command => command.id)).toEqual([
      firstCommand.id,
      secondCommand.id,
    ]);
    expect(state.resources.map(resource => resource.id)).toEqual([
      'acct_queue_first',
      'acct_queue_second',
    ]);

    const diagnostics = await Effect.runPromise(
      decodeRpc(await userReplicaApi.listAggregateFrontendReplicas()),
    );
    const diagnostic = diagnostics[0];
    if (diagnostic === undefined) {
      throw new Error('aggregate diagnostic missing');
    }
    const aggregateDatabase = databaseClients.get(
      `zerospin/056/sys_1/users/user_1/aggregate/${diagnostic.databaseName}`,
    );
    if (aggregateDatabase === undefined) {
      throw new Error('aggregate database missing');
    }
    const journalRows = aggregateDatabase.exec(
      'SELECT commandId, sessionId, sessionIndex, command FROM aggregateFrontendCommandJournal ORDER BY commandId',
    )[0]?.values;
    expect(
      journalRows?.map(([commandId, sessionId, sessionIndex, encoded]) => [
        commandId,
        sessionId,
        sessionIndex,
        JSON.parse(String(encoded)).replicaIndex,
        JSON.parse(String(encoded)).status,
      ]),
    ).toEqual([
      [firstCommand.id, firstCommand.sessionId, 1, 1, 'staged'],
      [secondCommand.id, secondCommand.sessionId, 1, 2, 'staged'],
    ]);
    await expect(
      Effect.runPromise(
        decodeRpc(
          await userReplicaApi.stageAggregateFrontendCommand({
            target: {
              aggregateId: aggregateState.aggregateId,
              aggregateName: aggregateState.aggregateName,
              frontendName: aggregateState.frontendName,
              aggregateFrontendLockKey,
            },
            sessionIndex: 1,
            command: firstCommand,
            mutations: firstMutations,
          }),
        ),
      ),
    ).resolves.toEqual({ commandId: firstCommand.id });
    const resumedState = await Effect.runPromise(
      decodeRpc(await acquisition.getState()),
    );
    expect(resumedState.replicaIndex).toBe(2);
    expect(resumedState.resources.map(resource => resource.id)).toEqual([
      'acct_queue_first',
      'acct_queue_second',
    ]);
    const resumedJournalRow = aggregateDatabase.exec(
      "SELECT command FROM aggregateFrontendCommandJournal WHERE commandId = 'cmd_queue_first'",
    )[0]?.values;
    expect(JSON.parse(String(resumedJournalRow?.[0]?.[0]))).toMatchObject({
      replicaIndex: 1,
      status: 'staged',
    });

    await Effect.runPromise(decodeRpc(await acquisition.release()));
    unregisteredSystemApi[Symbol.dispose]();
    unregisteredChannel.port1.close();
    unregisteredChannel.port2.close();
    systemApi[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });
});
