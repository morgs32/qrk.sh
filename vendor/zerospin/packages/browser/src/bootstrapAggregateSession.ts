import type { IAggregateNodeSnapshot } from '@zerospin/core/AggregateNode/AggregateNode';
import type { IAggregateNodeCommandInput } from '@zerospin/core/AggregateNode/types';
import { SessionCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import {
  bindAggregateSession,
  type IAggregateSessionHandoff,
} from '@zerospin/core/aggregateSession/bindAggregateSession';
import { importAggregateNodeCommands } from '@zerospin/core/aggregateSession/importAggregateNodeCommands';
import { initializeAggregateNodeProjection } from '@zerospin/core/aggregateSession/initializeAggregateNodeProjection';
import { makeAggregateSessionLockKey } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLockKey';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type { IAggregateSessionReplayRequirements } from '@zerospin/core/aggregateSession/replayPendingCommandsTx';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import { stageSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx';
import type {
  IAggregateBrowserCommand,
  IAggregateSession,
  IAggregateSessionDefinition,
  ISessionId,
} from '@zerospin/core/aggregateSession/types';
import type { Async } from '@zerospin/core/async/Async';
import {
  resolveSessionFailure,
  type IFailure,
} from '@zerospin/core/contracts/failureCodec';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeProvisionedInMemoryWasmSqliteDb';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import {
  catchZerospinError,
  isZerospinError,
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect, Schema, type Scope } from 'effect';

import { connectAggregateNode } from './AggregateNode/connectAggregateNode.ts';
import type {
  IBrowserSessionFailureCallbacks,
  ISessionCommandFailure,
} from './failureTypes.ts';
import { restoreRpcError } from './Node/publicRpcError.ts';
import type { IZerospinRuntime } from './sessionRuntime';

export const bootstrapAggregateSession = Effect.fn('bootstrapAggregateSession')(
  function* <D extends IAggregateSessionDefinition>(props: {
    session: IAggregateSession<D>;
    sessionId: ISessionId;
    runtime: IZerospinRuntime<IAggregateSessionReplayRequirements<D>>;
    apiUrl: string;
    publishableKey: string;
    systemName: string;
    getAdmission(): Promise<
      IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
    >;
    sharedWorker: (props: { name: string }) => SharedWorker;
    failureCallbacks: IBrowserSessionFailureCallbacks;
    signal: AbortSignal;
    expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  }): Effect.fn.Return<
    {
      getPushPaused: Effect.Effect<boolean, IAnyError>;
      setPushPaused(input: {
        pushPaused: boolean;
      }): Effect.Effect<void, IAnyError>;
      pushNow: Effect.Effect<{ status: 'empty' | 'pushed' }, IAnyError>;
      clearAuthentication(): Promise<void>;
    },
    IAnyError,
    Async | Scope.Scope
  > {
    const {
      session,
      sessionId,
      runtime,
      apiUrl,
      publishableKey,
      systemName,
      getAdmission,
      expectedClaims,
      sharedWorker,
      failureCallbacks,
      signal,
    } = props;
    const definition = session.definition;
    let disposed = false;
    const current = () => !disposed && !signal.aborted;
    const models: D['models'] = definition.models;
    const lock = makeAggregateSessionSpec(definition).aggregateSessionLock;
    const aggregateSessionLockKey = yield* makeAggregateSessionLockKey(lock);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: sessionRepoDbConfig.tables,
    });
    const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
    const uncertain = new Map<string, IAggregateNodeCommandInput>();
    const originatingCommands = new Map<string, string>();
    let blockedNotified = false;
    const notifyCommandFailure = (
      event: { commandId: string; commandName: string; failure: IFailure },
      notify: ((event: ISessionCommandFailure) => void) | undefined,
    ) => {
      const { commandId, commandName, failure } = event;
      if (!current() || originatingCommands.get(commandId) !== commandName) {
        return;
      }
      let recognized: ISessionCommandFailure['failure'];
      try {
        recognized = Effect.runSync(
          resolveSessionFailure(definition, commandName, failure),
        );
      } catch (error) {
        console.error('Cannot recognize aggregate command failure', error);
        return;
      }
      originatingCommands.delete(commandId);
      notify?.({ commandId, commandName, failure: recognized });
    };
    const observeCommand = (command: IAggregateBrowserCommand) => {
      if (originatingCommands.get(command.id) !== command.commandName) return;
      if (command.admission?.status === 'failed') {
        notifyCommandFailure(
          {
            commandId: command.id,
            commandName: command.commandName,
            failure: command.admission.failure,
          },
          failureCallbacks.onAdmissionFailure,
        );
      } else if (command.execution?.status === 'failed') {
        notifyCommandFailure(
          {
            commandId: command.id,
            commandName: command.commandName,
            failure: command.execution.failure,
          },
          failureCallbacks.onExecutionFailure,
        );
      } else if (command.execution?.status === 'succeeded') {
        originatingCommands.delete(command.id);
      }
    };
    const observeNodeState = (state: IAggregateNodeSnapshot['state']) => {
      if (!current()) return;
      if (!state.blockedWork) {
        blockedNotified = false;
        return;
      }
      if (state.admissionRejection != null) {
        blockedNotified = true;
        notifyCommandFailure(
          state.admissionRejection,
          failureCallbacks.onAdmissionFailure,
        );
        return;
      }
      if (state.authentication === 'signed-out') {
        blockedNotified = true;
        return;
      }
      if (blockedNotified || !state.failure) return;
      if (state.localAvailability === 'failed') {
        blockedNotified = true;
        failureCallbacks.onSharedWorkerPersistenceFailure?.({
          message: state.failure,
        });
      } else if (state.authentication === 'rejected') {
        blockedNotified = true;
        failureCallbacks.onAuthenticationFailure?.({
          message: state.failure,
        });
      } else if (
        state.localAvailability === 'available' &&
        state.synchronization === 'blocked'
      ) {
        blockedNotified = true;
        failureCallbacks.onServerProtocolFailure?.({
          message: state.failure,
        });
      }
    };
    const sharedWorkerConnectionFailed = (event: { message: string }) => {
      if (!current() || blockedNotified) return;
      blockedNotified = true;
      failureCallbacks.onSharedWorkerConnectionFailure?.(event);
    };
    let connection: Awaited<ReturnType<typeof connectAggregateNode>>;
    const accept = async (command: IAggregateNodeCommandInput) => {
      const receipt = await connection.node
        .accept(command)
        .catch(restoreRpcError);
      if (receipt.id !== command.id) {
        throw makeZerospinError({
          code: 'node-acceptance-receipt-invalid',
          message:
            'Node acceptance receipt does not match the submitted command',
        });
      }
      if (!current()) return receipt;
      uncertain.delete(command.id);
      const state = session.store.getState().nodeState;
      if (state != null) {
        session.store.setState({
          nodeState: { ...state, uncertainHandoffs: uncertain.size },
        });
      }
      return receipt;
    };
    const forkAcceptance = (command: IAggregateNodeCommandInput) =>
      runtime.runFork(
        Effect.tryPromise({
          try: () => accept(command),
          catch: catchZerospinError({ code: 'node-acceptance-uncertain' }),
        }).pipe(Effect.catchCause(() => Effect.void)),
      );
    const handoff: IAggregateSessionHandoff = encodedCommand => {
      if (!current()) return;
      try {
        originatingCommands.set(encodedCommand.id, encodedCommand.commandName);
        const staged = Schema.encodeSync(SessionCommandSchema)(encodedCommand);
        const command: IAggregateNodeCommandInput = {
          id: staged.id,
          commandName: staged.commandName,
          payload: staged.payload,
          contractVersion: staged.contractVersion,
          aggregateId: staged.aggregateId,
          aggregateName: staged.aggregateName,
          actorName: staged.actorName,
          actorVersion: staged.actorVersion,
          sessionName: staged.sessionName,
          claims: staged.claims,
          staging: staged.staging,
        };
        uncertain.set(command.id, command);
        const state = session.store.getState().nodeState;
        if (state != null) {
          session.store.setState({
            nodeState: { ...state, uncertainHandoffs: uncertain.size },
          });
        }
        forkAcceptance(command);
      } catch (cause) {
        sharedWorkerConnectionFailed({
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    };
    connection = yield* Effect.tryPromise({
      try: () =>
        connectAggregateNode({
          request: {
            apiUrl,
            publishableKey,
            systemName,
            aggregateName: definition.aggregateName,
            aggregateVersion: definition.aggregateVersion,
            sessionName: definition.sessionName,
            lock,
          },
          getAdmission,
          sharedWorker,
          expectedClaims,
          sharedWorkerConnectionFailure: failure => {
            if (current()) sharedWorkerConnectionFailed(failure);
          },
          initialize: async snapshot => {
            if (!current()) return;
            const acceptedClaims = Schema.decodeUnknownSync(
              definition.claimsSchema,
            )(snapshot.identity.claims);
            assertSessionClaims(expectedClaims, acceptedClaims);
            runtime.runSync(
              initializeAggregateNodeProjection({
                db,
                definition,
                sessionId,
                snapshot,
              }),
            );
            bindAggregateSession({
              session,
              runtime,
              commitCommand: stageSessionCommandTx,
              handoff,
              state: {
                sessionId,
                actorName: definition.actorName,
                actorVersion: definition.actorVersion,
                aggregateId: Schema.decodeUnknownSync(
                  Schema.TemplateLiteral(['acct_', Schema.String]),
                )(snapshot.identity.aggregateId),
                aggregateName: definition.aggregateName,
                claims: acceptedClaims,
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
                sessionStatus: snapshot.state.blockedWork
                  ? 'failed'
                  : snapshot.state.localAvailability === 'available'
                    ? 'current'
                    : 'bootstrapping',
                backupState: null,
                nodeState: {
                  ...snapshot.state,
                  nodeId: snapshot.metadata.nodeId,
                  nodeIndex: snapshot.metadata.nextNodeIndex - 1,
                  outcomeIndex: snapshot.metadata.outcomeIndex,
                  uncertainHandoffs: uncertain.size,
                  pushPaused: snapshot.metadata.pushPaused,
                },
              },
            });
            blockedNotified = snapshot.state.blockedWork;
            observeNodeState(snapshot.state);
          },
          commands: async (commands, throughChangeIndex) => {
            if (!current()) return;
            const progress = runtime.runSync(
              importAggregateNodeCommands({
                db,
                definition,
                sessionId,
                commands,
                throughChangeIndex,
              }),
            );
            for (const command of commands) uncertain.delete(command.id);
            const prior = session.store.getState().nodeState;
            session.store.setState({
              ...progress,
              ...(prior == null
                ? {}
                : {
                    nodeState: { ...prior, uncertainHandoffs: uncertain.size },
                  }),
            });
            for (const command of commands) {
              if ('executedIndex' in command) {
                observeCommand(command);
              }
            }
          },
          state: state => {
            if (!current()) return;
            const prior = session.store.getState().nodeState;
            session.store.setState({
              sessionStatus: state.blockedWork
                ? 'failed'
                : state.localAvailability === 'available'
                  ? 'current'
                  : 'bootstrapping',
              ...(prior == null ? {} : { nodeState: { ...prior, ...state } }),
            });
            observeNodeState(state);
          },
          reconnect: async () => {
            try {
              for (const command of uncertain.values()) {
                if (!current()) return;
                forkAcceptance(command);
              }
            } catch (cause) {
              sharedWorkerConnectionFailed({
                message: cause instanceof Error ? cause.message : String(cause),
              });
            }
          },
        }),
      catch: cause =>
        isZerospinError(cause)
          ? cause
          : catchZerospinError({ code: 'node-connection-failed' })(cause),
    });
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        disposed = true;
        try {
          await connection.dispose();
        } finally {
          db.$client.sqlite3.close(db.$client.db);
        }
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
      getPushPaused: Effect.tryPromise({
        try: async () =>
          (await connection.node.snapshot().catch(restoreRpcError)).metadata
            .pushPaused,
        catch: catchZerospinError({ code: 'node-push-state-failed' }),
      }),
      setPushPaused: (input: { pushPaused: boolean }) =>
        Effect.tryPromise({
          try: async () => {
            await connection.node.setPushPaused(input).catch(restoreRpcError);
          },
          catch: catchZerospinError({ code: 'node-push-state-failed' }),
        }),
      pushNow: Effect.tryPromise({
        try: async () => connection.node.pushNow().catch(restoreRpcError),
        catch: catchZerospinError({ code: 'node-push-failed' }),
      }),
      clearAuthentication: async () => {
        await connection.node.clearAuthentication().catch(restoreRpcError);
      },
    };
  },
);
