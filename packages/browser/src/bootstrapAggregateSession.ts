import { SessionCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { getAggregateSessionExecutionResources } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeAggregateSessionLockKey } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLockKey';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import { replayPendingCommandsTx } from '@zerospin/core/aggregateSession/replayPendingCommandsTx';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeProvisionedInMemoryWasmSqliteDb';
import { assertSessionIdentity } from '@zerospin/core/identity/assertSessionIdentity';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import {
  catchZerospinError,
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { getTableName, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { connectBrowserNode, nodeResult } from './connectBrowserNode.ts';
import type { INodeCommandInput } from './Node/types.ts';

export const bootstrapAggregateSession = Effect.fn('bootstrapAggregateSession')(
  function* <D extends IAggregateSessionDefinition>(props: {
    aggregateVersion: string;
    session: IAggregateSession<D>;
    apiUrl: string;
    publishableKey: string;
    systemName: string;
    getAdmission(): Promise<
      IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
    >;
    expectedIdentity?: Readonly<Record<string, unknown>> | undefined;
  }) {
    const {
      session,
      apiUrl,
      publishableKey,
      systemName,
      getAdmission,
      expectedIdentity,
    } = props;
    const definition = session.definition;
    const execution = getAggregateSessionExecutionResources(session);
    if (execution === undefined) {
      return yield* makeZerospinError({ code: 'aggregate-session-not-ready' });
    }
    const { sessionId, runtime } = execution;
    const models: D['models'] = definition.models;
    const lock = makeAggregateSessionSpec(definition).aggregateSessionLock;
    const aggregateSessionLockKey = yield* makeAggregateSessionLockKey(lock);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: sessionRepoDbConfig.tables,
    });
    const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
    const uncertain = new Map<string, INodeCommandInput>();
    let connection: Awaited<ReturnType<typeof connectBrowserNode>>;
    const accept = async (command: INodeCommandInput) => {
      const retained = nodeResult(await connection.node.accept(command));
      uncertain.delete(command.id);
      const state = session.store.getState().nodeState;
      if (state != null) {
        session.store.setState({
          nodeState: { ...state, uncertainHandoffs: uncertain.size },
        });
      }
      // A lost reply may be retried after the outcome has already arrived.
      if (retained.executedIndex !== null) await refresh();
      return { commandId: retained.id };
    };
    let refresh = async () => {};
    connection = yield* Effect.tryPromise({
      try: () =>
        connectBrowserNode({
          request: {
            kind: 'aggregate',
            apiUrl,
            publishableKey,
            systemName,
            targetName: definition.aggregateName,
            targetVersion: definition.aggregateVersion,
            sessionName: definition.sessionName,
            lock,
          },
          getAdmission,
          expectedIdentity,
          receive: async snapshot => {
            const identity = snapshot.identity;
            const acceptedIdentity = Schema.decodeUnknownSync(
              definition.identity.identitySchema,
            )(identity.identity);
            assertSessionIdentity(expectedIdentity, acceptedIdentity);
            const accepted = new Set(
              snapshot.unresolvedCommands.map(command => command.id),
            );
            for (const id of accepted) uncertain.delete(id);
            db.transaction(tx => {
              tx.run(sql`PRAGMA defer_foreign_keys = ON`);
              tx.delete(
                sessionRepoDbConfig.schema.optimisticAppliedMutations,
              ).run();
              tx.delete(sessionRepoDbConfig.schema.commands).run();
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
              const commands = [
                ...snapshot.unresolvedCommands.map(command => ({
                  command,
                  pushIndex: command.aggregateIndex,
                })),
                ...[...uncertain.values()].map(command => ({
                  command,
                  pushIndex: null,
                })),
              ];
              commands.forEach(({ command, pushIndex }, index) => {
                const decoded = Schema.decodeUnknownSync(SessionCommandSchema)({
                  id: command.id,
                  commandName: command.commandName,
                  payload: command.payload,
                  contractVersion: command.contractVersion,
                  aggregateId: command.aggregateId,
                  aggregateName: command.aggregateName,
                  actorName: command.actorName,
                  actorVersion: command.actorVersion,
                  sessionName: command.sessionName,
                  identity: command.identity,
                  staging: command.staging,
                  sessionId,
                  sessionIndex: index + 1,
                  pushIndex,
                  admission:
                    'admission' in command
                      ? command.admission
                      : { status: 'pending' },
                  execution:
                    'execution' in command
                      ? command.execution
                      : { status: 'pending' },
                });
                tx.insert(sessionRepoDbConfig.schema.commands)
                  .values(
                    Effect.runSync(
                      sessionRepoDbConfig.tables.commands.encodeRow({
                        ...decoded,
                        aggregateIndex: null,
                        executedIndex: null,
                        executedHash: null,
                        actorDelta: null,
                      }),
                    ),
                  )
                  .run();
              });
              tx.insert(sessionRepoDbConfig.schema.sessionMetadata)
                .values({
                  sessionId,
                  actorName: definition.actorName,
                  actorVersion: definition.actorVersion,
                  nextSessionIndex: commands.length + 1,
                  aggregateIndex: snapshot.metadata.aggregateIndex,
                  executedIndex: snapshot.metadata.executedIndex,
                  executedHash: snapshot.metadata.executedHash,
                  pushIndex: 0,
                })
                .onConflictDoUpdate({
                  target: sessionRepoDbConfig.schema.sessionMetadata.sessionId,
                  set: {
                    nextSessionIndex: commands.length + 1,
                    executedIndex: snapshot.metadata.executedIndex,
                    executedHash: snapshot.metadata.executedHash,
                  },
                })
                .run();
              runtime.runSync(replayPendingCommandsTx({ tx, definition }));
            });
            session.store.setState({
              sessionId,
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              aggregateId: Schema.decodeUnknownSync(
                Schema.TemplateLiteral(['acct_', Schema.String]),
              )(identity.targetId),
              aggregateName: definition.aggregateName,
              identity: acceptedIdentity,
              sessionName: definition.sessionName,
              aggregateSessionLockKey,
              db,
              schema: dbConfig.schema,
              models,
              isInitialized: true,
              aggregateIndex: snapshot.metadata.aggregateIndex,
              executedIndex: snapshot.metadata.executedIndex,
              executedHash: snapshot.metadata.executedHash,
              pushIndex: snapshot.metadata.outcomeIndex,
              sessionStatus: snapshot.state.blockedWork ? 'failed' : 'current',
              backupState: null,
              nodeState: {
                ...snapshot.state,
                nodeId: snapshot.metadata.nodeId,
                nodeIndex: snapshot.metadata.nextNodeIndex - 1,
                outcomeIndex: snapshot.metadata.outcomeIndex,
                uncertainHandoffs: uncertain.size,
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
          reconnect: async () => {
            for (const command of uncertain.values()) await accept(command);
          },
        }),
      catch: catchZerospinError({ code: 'node-connection-failed' }),
    });
    refresh = connection.resnapshot;
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        await connection.dispose();
        db.$client.sqlite3.close(db.$client.db);
      }),
    );
    yield* Effect.tryPromise({
      try: connection.ready,
      catch: catchZerospinError({ code: 'node-attachment-failed' }),
    });
    return {
      executeAggregateSessionCommand: (input: {
        command: Parameters<
          NonNullable<typeof execution.executeAggregateSessionCommand>
        >[0]['command'];
      }) => {
        const staged = Schema.encodeSync(SessionCommandSchema)(input.command);
        const command: INodeCommandInput = {
          id: staged.id,
          commandName: staged.commandName,
          payload: staged.payload,
          contractVersion: staged.contractVersion,
          aggregateId: staged.aggregateId,
          aggregateName: staged.aggregateName,
          actorName: staged.actorName,
          actorVersion: staged.actorVersion,
          sessionName: staged.sessionName,
          identity: staged.identity,
          staging: staged.staging,
        };
        uncertain.set(command.id, command);
        const state = session.store.getState().nodeState;
        if (state != null) {
          session.store.setState({
            nodeState: { ...state, uncertainHandoffs: uncertain.size },
          });
        }
        return Effect.tryPromise({
          try: () => accept(command),
          catch: catchZerospinError({ code: 'node-acceptance-uncertain' }),
        });
      },
      getPushPaused: Effect.tryPromise({
        try: async () =>
          nodeResult(await connection.node.snapshot()).metadata.pushPaused,
        catch: catchZerospinError({ code: 'node-push-state-failed' }),
      }),
      setPushPaused: (input: { pushPaused: boolean }) =>
        Effect.tryPromise({
          try: async () => {
            nodeResult(await connection.node.setPushPaused(input));
          },
          catch: catchZerospinError({ code: 'node-push-state-failed' }),
        }),
      pushNow: Effect.tryPromise({
        try: async () => nodeResult(await connection.node.pushNow()),
        catch: catchZerospinError({ code: 'node-push-failed' }),
      }),
      clearAuthentication: async () => {
        nodeResult(await connection.node.clearAuthentication());
      },
      history: async (page: { afterNodeIndex: number; limit: number }) =>
        nodeResult(await connection.node.history(page)),
    };
  },
);
