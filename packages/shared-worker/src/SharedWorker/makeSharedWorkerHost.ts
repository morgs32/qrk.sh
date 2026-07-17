import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { newMessagePortRpcSession, RpcTarget } from 'capnweb';
import { Effect, Layer, ManagedRuntime, type Schema } from 'effect';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { makeAsyncWaSqliteDrizzle } from '../drizzle/makeAsyncWaSqliteDrizzle.ts';
import { makeIdbSQLite3 } from '../drizzle/makeIdbSQLite3.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../drizzle/types.ts';

import { makeVfsName } from './makeVfsName.ts';
import { migrateUserDbAsync } from './migrateUserDbAsync.ts';
import { replicas, userDbConfig } from './userSchemas.ts';

const userDatabaseName = 'user.db';

const sharedWorkerHostDefaultRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

export function makeSharedWorkerHost(
  props: {
    runtime?: ManagedRuntime.ManagedRuntime<
      CuidFactory | MonotonicFactory,
      IAnyError
    >;
  } = {},
): void {
  const { runtime = sharedWorkerHostDefaultRuntime } = props;

  const userStores = new Map<
    string,
    StoreApi<{
      userId: string;
      userSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
      db: IAsyncWaSqliteDrizzleDb<typeof userDbConfig>;
      systemId: string;
      generationId: string;
      vfsName: string;
    }>
  >();

  const locationUrl = new URL(globalThis.location.href);
  const systemId = locationUrl.searchParams.get('systemId');
  const generationId = locationUrl.searchParams.get('generationId');
  const wasmUrl = locationUrl.searchParams.get('wasmUrl');

  if (systemId === null || generationId === null || wasmUrl === null) {
    throw new Error(
      'SharedWorker URL is missing systemId, generationId, or wasmUrl search params',
    );
  }
  const sharedWorkerWasmUrl = wasmUrl;

  class UserApi extends RpcTarget {
    constructor(
      private readonly props: {
        userId: string;
      },
    ) {
      super();
    }

    private stagedCommandHandler?: (
      stagedCommands: readonly unknown[],
    ) => Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;

    async subscribe(props: {
      handleStagedCommands: (
        stagedCommands: readonly unknown[],
      ) => Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
    }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
      this.stagedCommandHandler = props.handleStagedCommands;
      return encodeRight(undefined);
    }

    async handleStagedCommands(
      stagedCommands: readonly unknown[],
    ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
      if (this.stagedCommandHandler === undefined) {
        return encodeRight(undefined);
      }

      return this.stagedCommandHandler(stagedCommands);
    }

    async listFrontendReplicas(): Promise<
      readonly {
        accountId: string;
        accountName: string;
        actorId: string;
        actorName: string;
        frontendName: string;
        frontendVersion: string;
        databaseName: string;
      }[]
    > {
      const { userId } = this.props;
      const store = userStores.get(`${systemId}/${generationId}/${userId}`);
      if (store === undefined) {
        throw new Error('SharedWorker UserApi store was not initialized');
      }

      return runtime.runPromise(
        Effect.promise(() =>
          store
            .getState()
            .db.select({
              accountId: replicas.accountId,
              accountName: replicas.accountName,
              actorId: replicas.actorId,
              actorName: replicas.actorName,
              frontendName: replicas.frontendName,
              frontendVersion: replicas.frontendVersion,
              databaseName: replicas.databaseName,
            })
            .from(replicas)
            .orderBy(replicas.frontendName)
            .all(),
        ),
      );
    }
  }

  class SharedSystemWorkerApi extends RpcTarget {
    constructor(
      private readonly props: {
        systemId: string;
        generationId: string;
      },
    ) {
      super();
    }

    async getUserApi(props: { userId: string }): Promise<UserApi> {
      const { systemId, generationId } = this.props;
      const { userId } = props;

      const userStoreKey = `${systemId}/${generationId}/${userId}`;
      const existingStore = userStores.get(userStoreKey);
      if (existingStore !== undefined) {
        return new UserApi({ userId });
      }

      const store = await runtime.runPromise(
        Effect.gen(function* () {
          const vfsName = yield* makeVfsName({
            systemId,
            generationId,
            userId,
          });
          const userSqlite = yield* Effect.tryPromise({
            try: () =>
              makeIdbSQLite3({
                databaseName: userDatabaseName,
                vfsName,
                wasmUrl: sharedWorkerWasmUrl,
              }),
            catch: ZerospinError.catch({
              code: 'open-shared-worker-user-db-failed',
              message: 'Failed to open SharedWorker user DB',
            }),
          });
          const db = makeAsyncWaSqliteDrizzle(userSqlite, userDbConfig);
          yield* migrateUserDbAsync({
            db,
          });
          return createStore<{
            userId: string;
            userSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
            db: IAsyncWaSqliteDrizzleDb<typeof userDbConfig>;
            systemId: string;
            generationId: string;
            vfsName: string;
          }>(() => ({
            userId,
            userSqlite,
            db,
            systemId,
            generationId,
            vfsName,
          }));
        }),
      );

      userStores.set(userStoreKey, store);
      return new UserApi({ userId });
    }
  }

  globalThis.addEventListener('connect', event => {
    if (!(event instanceof MessageEvent)) {
      return;
    }
    const port = event.ports[0];
    if (!(port instanceof MessagePort)) {
      return;
    }

    port.start();
    newMessagePortRpcSession(
      port,
      new SharedSystemWorkerApi({ systemId, generationId }),
    );
  });
}
