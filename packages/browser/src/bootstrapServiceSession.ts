import type { Async } from '@zerospin/core/async/Async';
import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import type { IContractOutput } from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeProvisionedInMemoryWasmSqliteDb';
import type { ITx } from '@zerospin/core/drizzle/types';
import { runProgram } from '@zerospin/core/execution/runProgram';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { INodeCommand } from '@zerospin/core/Node/Node';
import type { INodeCommandInput } from '@zerospin/core/Node/types';
import { makeServiceSessionLockKey } from '@zerospin/core/serviceSession/make/makeServiceSessionLockKey';
import { makeServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import {
  serviceSessionMetadataDrizzleSchema,
  serviceSessionRepoTables,
} from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import { bindServiceSessionExecution } from '@zerospin/core/serviceSession/stageServiceCommand';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import {
  catchZerospinError,
  isZerospinError,
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeEffectSchema, makeIdFromAbbreviation } from '@zerospin/schema';
import { getTableName } from 'drizzle-orm';
import { Context, Effect, Schema, type Scope } from 'effect';

import { connectBrowserNode, nodeResult } from './connectBrowserNode.ts';
import { replaceServiceProjectionTx } from './replaceServiceProjectionTx.ts';
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
    const context = Context.makeUnsafe<unknown>(
      (yield* Effect.context()).mapUnsafe,
    );
    const runSync = Effect.runSyncWith(context);
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
    const predict = (
      command: INodeCommandInput,
      claims = session.store.getState().claims,
    ) => {
      const contract = definition.contracts[command.commandName];
      if (
        contract === undefined ||
        contract.version !== command.contractVersion
      ) {
        throw makeZerospinError({
          code: 'service-session-contract-unavailable',
        });
      }
      const payload = Schema.decodeUnknownSync(
        Schema.fromJsonString(makeEffectSchema(contract.payload)),
      )(command.payload);
      return runSync(
        makeOperations({
          db,
          contract,
          models,
          command: { ...command, payload },
          claims,
        }).pipe(runProgram),
      );
    };
    const project = (
      tx: ITx,
      command: INodeCommandInput,
      outputs: readonly {
        operationIndex: number;
        operation: IContractOutput;
      }[],
    ) => {
      for (const { operationIndex, operation } of outputs) {
        if (operation.operationName === 'async') {
          throw makeZerospinError('browser-async-operation-forbidden');
        }
        const appliedAt = new Date(command.staging.startedAt);

        runSync(
          applyOperationTx({
            tx,
            operation,
            commandId: command.id,
            operationIndex,
            appliedAt,
          }),
        );
      }
    };
    const validatePrediction = (command: INodeCommandInput) => {
      const rolledBack = new Error('Rollback local command preview');
      let encodedResult: typeof Schema.Json.Type = null;
      try {
        db.transaction(tx => {
          const predicted = predict(command);
          encodedResult = predicted.encodedResult;
          const outputs = predicted.operations.map(
            (operation, operationIndex) => ({ operation, operationIndex }),
          );
          project(tx, command, outputs);
          throw rolledBack;
        });
      } catch (cause) {
        if (cause !== rolledBack) throw cause;
      }
      return encodedResult;
    };
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
              replaceServiceProjectionTx(tx, {
                models,
                resources: snapshot.resources,
                pending: snapshot.unresolvedCommands,
                predict: command => predict(command, acceptedClaims).operations,
              });
              tx.insert(serviceSessionMetadataDrizzleSchema)
                .values({
                  sessionId,
                  serviceVersion: definition.serviceVersion,
                  executedIndex: snapshot.metadata.executedIndex,
                  serviceHash: snapshot.metadata.executedHash,
                })
                .onConflictDoUpdate({
                  target: serviceSessionMetadataDrizzleSchema.sessionId,
                  set: {
                    executedIndex: snapshot.metadata.executedIndex,
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
              commandHistory: snapshot.commandHistory ?? [],
              pendingCommandIds: snapshot.unresolvedCommands.map(
                command => command.id,
              ),
              executedIndex: snapshot.metadata.executedIndex,
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
    const prepare = ({
      contractName,
      payload,
    }: {
      contractName: string;
      payload: unknown;
    }) =>
      Effect.gen(function* () {
        const state = session.store.getState();
        if (!state.isInitialized || state.sessionStatus !== 'current') {
          return yield* makeZerospinError({
            code: 'service-session-not-current',
          });
        }
        const contract = definition.contracts[contractName];
        if (contract === undefined) {
          return yield* makeZerospinError({
            code: 'service-session-contract-unavailable',
          });
        }
        const stagedAt = new Date().toISOString();
        const command = yield* encodeCommand({
          contract,
          command: {
            id: yield* makeIdFromAbbreviation({
              abbreviation: coreAbbreviations.command,
            }),
            commandName: contract.commandName,
            contractVersion: contract.version,
            payload,
            claims: yield* Schema.encodeEffect(definition.claimsSchema)(
              state.claims,
            ),
            targetId: state.serviceName,
            targetName: state.serviceName,
            actorName: definition.actorName,
            actorVersion: definition.actorVersion,
            sessionName: definition.sessionName,
            staging: {
              result: null,
              startedAt: stagedAt,
              completedAt: stagedAt,
              stagedDelta: {
                inserted: [],
                updated: [],
                deleted: [],
                operations: [],
              },
            },
          },
        });
        const result = yield* Effect.try({
          try: () => validatePrediction(command),
          catch: cause =>
            isZerospinError(cause)
              ? cause
              : catchZerospinError({ code: 'service-command-staging-failed' })(
                  cause,
                ),
        });
        return { ...command, staging: { ...command.staging, result } };
      });
    const unbind = bindServiceSessionExecution(session, {
      can: props =>
        runSync(prepare(props).pipe(Effect.asVoid, encodeRpcOutcome)),
      stage: async props => {
        const staged = runSync(prepare(props).pipe(encodeRpcOutcome));
        if (staged._tag === 'Failure') return staged;
        try {
          nodeResult(await connection.node.accept(staged.success));
          return staged;
        } catch (cause) {
          return {
            _tag: 'Failure',
            failure: isZerospinError(cause)
              ? cause
              : catchZerospinError({ code: 'service-command-handoff-failed' })(
                  cause,
                ),
          };
        }
      },
    });
    yield* Effect.addFinalizer(() => Effect.sync(unbind));
    return {
      clearAuthentication: async () => {
        nodeResult(await connection.node.clearAuthentication());
      },
      history: async (page: { afterNodeIndex: number; limit: number }) =>
        nodeResult(await connection.node.history(page)),
    };
  },
);
