import type { Async } from '@zerospin/core/async/Async';
import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import {
  resolveFailure,
  type IFailure,
} from '@zerospin/core/contracts/failureCodec';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import { prepareContractInput } from '@zerospin/core/contracts/prepareContractInput';
import type { IContractOutput } from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeProvisionedInMemoryWasmSqliteDb';
import type { ITx } from '@zerospin/core/drizzle/types';
import { runProgram } from '@zerospin/core/execution/runProgram';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { IServiceNodeSnapshot } from '@zerospin/core/ServiceNode/ServiceNode';
import type { IServiceNodeCommandInput } from '@zerospin/core/ServiceNode/types';
import {
  importServiceNodeCommands,
  stageServiceCommandTx,
} from '@zerospin/core/serviceSession/importServiceNodeCommands';
import { initializeServiceNodeProjection } from '@zerospin/core/serviceSession/initializeServiceNodeProjection';
import { makeServiceSessionLockKey } from '@zerospin/core/serviceSession/make/makeServiceSessionLockKey';
import { makeServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import { serviceSessionRepoTables } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import { bindServiceSessionExecution } from '@zerospin/core/serviceSession/stageServiceCommand';
import type {
  IServiceBrowserCommand,
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import {
  catchZerospinError,
  isZerospinError,
  makeZerospinError,
  recognizeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeEffectSchema, makeIdFromAbbreviation } from '@zerospin/shapes';
import { Context, Effect, Schema, type Scope } from 'effect';

import type {
  IBrowserSessionFailureCallbacks,
  ISessionCommandFailure,
} from './failureTypes.ts';
import { restoreRpcError } from './Node/publicRpcError.ts';
import { connectServiceNode } from './ServiceNode/connectServiceNode.ts';
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
    failureCallbacks: IBrowserSessionFailureCallbacks;
    signal: AbortSignal;
    expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  }): Effect.fn.Return<
    {
      clearAuthentication(): Promise<void>;
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
      failureCallbacks,
      signal,
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
    let disposed = false;
    const current = () => !disposed && !signal.aborted;
    const lock = makeServiceSessionSpec(definition).serviceSessionLock;
    const serviceSessionLockKey = yield* makeServiceSessionLockKey(lock);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: serviceSessionRepoTables,
    });
    const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
    const predict = (
      command: IServiceNodeCommandInput,
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
        Effect.gen(function* () {
          const decodedCommand = { ...command, payload };
          const input = yield* prepareContractInput({
            contract,
            command: decodedCommand,
            claims,
          });
          return yield* makeOperations({
            db,
            contract,
            models,
            command: decodedCommand,
            input,
          });
        }).pipe(runProgram),
      );
    };
    const project = (
      tx: ITx,
      command: IServiceNodeCommandInput,
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
    const validatePrediction = (command: IServiceNodeCommandInput) => {
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
    const uncertain = new Map<string, IServiceNodeCommandInput>();
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
        const contract = definition.contracts[commandName];
        recognized =
          contract === undefined
            ? recognizeZerospinError(Schema.Never, failure)
            : Effect.runSync(resolveFailure(contract, failure));
      } catch (error) {
        console.error('Cannot recognize service command failure', error);
        return;
      }
      originatingCommands.delete(commandId);
      notify?.({ commandId, commandName, failure: recognized });
    };
    const observeCommand = (command: IServiceBrowserCommand) => {
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
    const observeNodeState = (state: IServiceNodeSnapshot['state']) => {
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
        failureCallbacks.onAuthenticationFailure?.({ message: state.failure });
      } else if (
        state.localAvailability === 'available' &&
        state.synchronization === 'blocked'
      ) {
        blockedNotified = true;
        failureCallbacks.onServerProtocolFailure?.({ message: state.failure });
      }
    };
    const sharedWorkerConnectionFailed = (event: { message: string }) => {
      if (!current() || blockedNotified) return;
      blockedNotified = true;
      failureCallbacks.onSharedWorkerConnectionFailure?.(event);
    };
    let connection: Awaited<ReturnType<typeof connectServiceNode>>;
    const accept = async (command: IServiceNodeCommandInput) => {
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
        try {
          session.store.setState({
            nodeState: { ...state, uncertainHandoffs: uncertain.size },
          });
        } catch (cause) {
          console.error(
            'Service session acceptance state observer threw',
            cause,
          );
        }
      }
      return receipt;
    };
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
            serviceName: state.serviceName,
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
      stage: props => {
        if (!current()) {
          return {
            _tag: 'Failure',
            failure: makeZerospinError('service-session-not-ready'),
          };
        }
        const staged = runSync(prepare(props).pipe(encodeRpcOutcome));
        if (staged._tag === 'Failure') return staged;
        try {
          runSync(
            stageServiceCommandTx({
              db,
              definition,
              sessionId,
              command: staged.success,
            }),
          );
        } catch (cause) {
          return {
            _tag: 'Failure',
            failure: isZerospinError(cause)
              ? cause
              : catchZerospinError({ code: 'service-command-staging-failed' })(
                  cause,
                ),
          };
        }
        originatingCommands.set(staged.success.id, staged.success.commandName);
        uncertain.set(staged.success.id, staged.success);
        try {
          const state = session.store.getState().nodeState;
          if (state != null) {
            session.store.setState({
              nodeState: { ...state, uncertainHandoffs: uncertain.size },
            });
          }
        } catch (cause) {
          // Publication cannot turn an already committed command into a staging failure.
          console.error(
            'Service session command handoff state observer threw',
            cause,
          );
        }
        return { _tag: 'Success' as const, success: staged.success };
      },
      accept: async command => {
        try {
          if (!current()) throw makeZerospinError('service-session-not-ready');
          await accept(command);
          return { _tag: 'Success', success: undefined };
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
    connection = yield* Effect.tryPromise({
      try: () =>
        connectServiceNode({
          request: {
            apiUrl,
            publishableKey,
            systemName,
            serviceName: definition.serviceName,
            serviceVersion: definition.serviceVersion,
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
            runSync(
              initializeServiceNodeProjection({
                db,
                definition,
                sessionId,
                snapshot,
              }),
            );
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
              serviceIndex: snapshot.metadata.serviceIndex,
              executedIndex: snapshot.metadata.executedIndex,
              serviceHash: snapshot.metadata.serviceHash,
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
            });
            blockedNotified = snapshot.state.blockedWork;
            observeNodeState(snapshot.state);
          },
          commands: async (commands, throughChangeIndex) => {
            if (!current()) return;
            const progress = runSync(
              importServiceNodeCommands({
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
              if ('executedIndex' in command) observeCommand(command);
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
            for (const command of uncertain.values()) {
              if (!current()) return;
              await accept(command);
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
      clearAuthentication: async () => {
        await connection.node.clearAuthentication().catch(restoreRpcError);
      },
    };
  },
);
