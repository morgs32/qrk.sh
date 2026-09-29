import type { Async } from '@zerospin/core/async/Async';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeProvisionedInMemoryWasmSqliteDb';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { INodeCommand } from '@zerospin/core/Node/Node';
import { makeServiceSessionLockKey } from '@zerospin/core/serviceSession/make/makeServiceSessionLockKey';
import { makeServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import {
  serviceSessionMetadataDrizzleSchema,
  serviceSessionRepoTables,
} from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import {
  catchZerospinError,
  isZerospinError,
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { getTableName, sql } from 'drizzle-orm';
import { Effect, Schema, type Scope } from 'effect';

import { connectBrowserNode, nodeResult } from './connectBrowserNode.ts';

export const bootstrapServiceSession = Effect.fn('bootstrapServiceSession')(
  function* <D extends IServiceSessionDefinition>(props: {
    serviceVersion: string;
    session: IServiceSession<D>;
    apiUrl: string;
    publishableKey: string;
    systemName: string;
    getAdmission(): Promise<
      IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
    >;
    sharedWorker: (props: { name: string }) => SharedWorker;
    expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  }): Effect.fn.Return<
    {
      clearAuthentication(): Promise<void>;
      history(page: {
        afterNodeIndex: number;
        limit: number;
      }): Promise<readonly INodeCommand[]>;
    },
    IAnyError,
    Async | Scope.Scope
  > {
    const {
      session,
      apiUrl,
      publishableKey,
      systemName,
      getAdmission,
      expectedClaims,
      sharedWorker,
    } = props;
    const definition = session.definition;
    const models = session.models;
    const sessionId = session.sessionId;
    if (sessionId === null) {
      return yield* makeZerospinError({ code: 'service-session-not-ready' });
    }
    const lock = makeServiceSessionSpec(definition).serviceSessionLock;
    const serviceSessionLockKey = yield* makeServiceSessionLockKey(lock);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: serviceSessionRepoTables,
    });
    const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
    const connection = yield* Effect.tryPromise({
      try: () =>
        connectBrowserNode({
          request: {
            kind: 'service',
            apiUrl,
            publishableKey,
            systemName,
            targetName: definition.serviceName,
            targetVersion: definition.serviceVersion,
            sessionName: definition.sessionName,
            lock,
          },
          getAdmission,
          sharedWorker,
          expectedClaims,
          receive: async snapshot => {
            const acceptedClaims = Schema.decodeUnknownSync(
              definition.claimsSchema,
            )(snapshot.identity.claims);
            assertSessionClaims(expectedClaims, acceptedClaims);
            db.transaction(tx => {
              tx.run(sql`PRAGMA defer_foreign_keys = ON`);
              for (const model of Object.values(models)) {
                tx.delete(model.drizzleSchema).run();
              }
              for (const resource of snapshot.resources) {
                const model = models[resource.modelName];
                if (model === undefined) {
                  throw makeZerospinError({
                    code: 'node-resource-model-invalid',
                  });
                }
                tx.insert(model.drizzleSchema).values(resource).run();
              }
              tx.insert(serviceSessionMetadataDrizzleSchema)
                .values({
                  sessionId,
                  serviceVersion: definition.serviceVersion,
                  serviceIndex: snapshot.metadata.executedIndex,
                  serviceHash: snapshot.metadata.executedHash,
                })
                .onConflictDoUpdate({
                  target: serviceSessionMetadataDrizzleSchema.sessionId,
                  set: {
                    serviceIndex: snapshot.metadata.executedIndex,
                    serviceHash: snapshot.metadata.executedHash,
                  },
                })
                .run();
            });
            session.store.setState({
              sessionId,
              claims: acceptedClaims,
              serviceName: definition.serviceName,
              serviceVersion: definition.serviceVersion,
              sessionName: definition.sessionName,
              serviceSessionLockKey,
              db,
              schema: dbConfig.schema,
              models,
              isInitialized: true,
              serviceIndex: snapshot.metadata.executedIndex,
              serviceHash: snapshot.metadata.executedHash,
              sessionStatus: snapshot.state.blockedWork ? 'failed' : 'current',
              backupState: null,
              nodeState: {
                ...snapshot.state,
                nodeId: snapshot.metadata.nodeId,
                nodeIndex: snapshot.metadata.nextNodeIndex - 1,
                outcomeIndex: snapshot.metadata.outcomeIndex,
                uncertainHandoffs: 0,
                pushPaused: snapshot.metadata.pushPaused,
              },
            });
            db.$client.flushTableChanges(
              new Set(Object.values(dbConfig.schema).map(getTableName)),
            );
          },
          state: state => {
            const prior = session.store.getState().nodeState;
            session.store.setState({
              sessionStatus: state.blockedWork ? 'failed' : 'current',
              ...(prior == null ? {} : { nodeState: { ...prior, ...state } }),
            });
          },
          reconnect: async () => {},
        }),
      catch: cause =>
        isZerospinError(cause)
          ? cause
          : catchZerospinError({ code: 'node-connection-failed' })(cause),
    });
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        await connection.dispose();
        db.$client.sqlite3.close(db.$client.db);
      }),
    );
    yield* Effect.tryPromise({
      try: connection.ready,
      // Readiness includes admission before the worker and projection after attachment.
      catch: cause =>
        isZerospinError(cause)
          ? cause
          : catchZerospinError({ code: 'session-initialization-failed' })(
              cause,
            ),
    });
    return {
      clearAuthentication: async () => {
        nodeResult(await connection.node.clearAuthentication());
      },
      history: async (page: { afterNodeIndex: number; limit: number }) =>
        nodeResult(await connection.node.history(page)),
    };
  },
);
