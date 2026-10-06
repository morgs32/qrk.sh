import type {
  IAnyAgentContracts,
  InferAgentContractBindings,
  InferAgentContracts,
} from '@zerospin/core/agent/makeAgentContract';
import {
  makeAgentSessionDefinition,
  type IAgentSessionDefinitionProps,
} from '@zerospin/core/agent/makeAgentSessionDefinition';
import type {
  IAgentConnectionState,
  IAgentSession,
  IAgentSessionBootstrap,
} from '@zerospin/core/agent/types';
import {
  AggregateBrowserCommandSchema,
  AggregateSessionSnapshotSchema,
} from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { applyAggregateSessionSnapshot } from '@zerospin/core/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshot';
import {
  bindAggregateSession,
  releaseAggregateSession,
} from '@zerospin/core/aggregateSession/bindAggregateSession';
import { decodeRetainedAggregateSessionCommand } from '@zerospin/core/aggregateSession/decodeRetainedAggregateSessionCommand';
import { importAggregateNodeCommands } from '@zerospin/core/aggregateSession/importAggregateNodeCommands';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeAggregateSessionLockKey } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLockKey';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import { stageSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx';
import type {
  IAggregateBrowserCommand,
  IAggregateSessionDefinition,
  ISessionId,
  ISessionWaSqliteDb,
} from '@zerospin/core/aggregateSession/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import { makeWaSqliteDrizzle } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeInMemoryWasmSqliteDb/makeWaSqliteDrizzle/makeWaSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import type { IClaimsSchema } from '@zerospin/core/identity/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type {
  IActorSelections,
  IAnyActorDbVersion,
  ICapturedActorSelections,
  ValidActorSelections,
} from '@zerospin/core/models/make/makeActorDbVersion';
import type {
  IAnyModels,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import {
  makeZerospinError,
  PublicFailureSchema,
  type IAnyError,
} from '@zerospin/error';
import { makeTelemetryLayer } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import { asc, eq, isNull } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { createStore } from 'zustand/vanilla';

const frameSchema = Schema.StructWithRest(
  Schema.Struct({ type: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** Cold ordinary aggregate session. Its mounted lifetime owns only memory SQLite and a socket. */
export function makeAgentSession<
  const SYSTEM extends string,
  const AGGREGATE extends string,
  const VERSION extends string,
  const ACTOR extends string,
  const ACTOR_VERSION extends string,
  const NAME extends string,
  const CLAIMS extends IClaimsSchema,
  const DB extends IAnyActorDbVersion,
  const SELECTIONS extends IActorSelections,
  const CONTRACTS extends IAnyAgentContracts,
>(props: {
  systemName: SYSTEM;
  aggregateName: AGGREGATE;
  aggregateVersion: VERSION;
  actorName: ACTOR;
  actorVersion: ACTOR_VERSION;
  sessionName: NAME;
  claimsSchema: CLAIMS;
  db: DB;
  selections: SELECTIONS & ValidActorSelections<DB['models'], SELECTIONS>;
  contracts: CONTRACTS & {
    [K in keyof CONTRACTS]: CONTRACTS[K]['model'] extends DB['models'][keyof DB['models']]
      ? CONTRACTS[K]['model']['modelName'] extends keyof SELECTIONS
        ? unknown
        : never
      : never;
  };
}): IAgentSession<
  IAggregateSessionDefinition<
    SYSTEM,
    AGGREGATE,
    NAME,
    InferAgentContracts<CONTRACTS>,
    DB['models'],
    VERSION,
    CLAIMS
  > & {
    actorName: ACTOR;
    actorVersion: ACTOR_VERSION;
    db: DB;
    selections: SELECTIONS;
    capturedSelections: ICapturedActorSelections<
      DB['models'],
      SELECTIONS,
      CLAIMS['Type']
    >;
    contractBindings: InferAgentContractBindings<CONTRACTS>;
  }
>;

export function makeAgentSession(props: IAgentSessionDefinitionProps): unknown {
  const definition = makeAgentSessionDefinition(props);
  const session = makeAggregateSession({ definition });
  const connection = createStore<IAgentConnectionState>(() => ({
    status: 'idle',
    error: null,
  }));
  const config = makeResourceDbConfig({
    models: definition.models,
    otherTables: sessionRepoDbConfig.tables,
  });
  function makeResourceRow(resource: IEncodedResourceShape) {
    const model = definition.models[resource.modelName];
    if (model === undefined) {
      throw new Error(
        `Agent resource model ${resource.modelName} is unavailable`,
      );
    }
    // The generic envelope decodes framework dates; the model codec owns every
    // other Date and JSON field before the table codec restores SQL row values.
    const decoded = Schema.decodeUnknownSync(model.resourceSchema)(
      Schema.encodeSync(EncodedResourceSchema)(resource),
      { onExcessProperty: 'error' },
    );
    return Schema.decodeUnknownSync(Schema.toType(EncodedResourceSchema))(
      Schema.encodeUnknownSync(model.table.codec)(decoded),
    );
  }
  function makeBrowserCommand(
    output: IAggregateBrowserCommand,
  ): IAggregateBrowserCommand {
    return {
      ...output,
      delta: {
        ...output.delta,
        upserted: output.delta.upserted.map(makeResourceRow),
      },
    };
  }
  let db: ISessionWaSqliteDb<IAnyModels, typeof config.relations> | null = null;
  let runtime: ManagedRuntime.ManagedRuntime<unknown, IAnyError> | null = null;
  let initialization: Promise<void> | null = null;
  let disposal: Promise<void> | null = null;
  let opening: Promise<void> | null = null;
  let bootstrap:
    | ((props: {
        signal: AbortSignal;
        nodeId: string;
      }) => Promise<IAgentSessionBootstrap>)
    | null = null;
  let aggregateId = '';
  let sessionId: ISessionId | null = null;
  let generation = 0;
  let lifetime = 0;
  let disposed = true;
  let controller: AbortController | null = null;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let replayTimeout: ReturnType<typeof setTimeout> | null = null;
  let admissionTimeout: ReturnType<typeof setTimeout> | null = null;
  let admitting: {
    commandId: string;
    resolve(): void;
    reject(error: unknown): void;
  } | null = null;
  let pushing: Promise<void> | null = null;

  function closeSocket() {
    if (replayTimeout !== null) clearTimeout(replayTimeout);
    replayTimeout = null;
    if (admissionTimeout !== null) clearTimeout(admissionTimeout);
    admissionTimeout = null;
    admitting?.reject(new Error('Command delivery interrupted'));
    admitting = null;
    if (socket !== null) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
      socket = null;
    }
  }
  function updateMetadata() {
    if (db === null || sessionId === null) return;
    const metadata = db
      .select()
      .from(config.schema.sessionMetadata)
      .where(eq(config.schema.sessionMetadata.sessionId, sessionId))
      .get();
    if (metadata === undefined) {
      throw new Error('Agent session metadata missing');
    }
    session.store.setState({
      aggregateIndex: metadata.aggregateIndex,
      executedIndex: metadata.executedIndex,
      executedHash: metadata.executedHash,
      pushIndex: metadata.pushIndex,
    });
  }
  function committedOutcomeIndex() {
    if (db === null) return 0;
    const submitted = db
      .select()
      .from(config.schema.commands)
      .orderBy(asc(config.schema.commands.nodeIndex))
      .all()
      .filter(row => row.nodeId === sessionId && row.nodeIndex !== null);
    let through = 0;
    for (const row of submitted) {
      if (row.nodeIndex !== through + 1 || row.executedIndex === null) break;
      through = row.nodeIndex;
    }
    return through;
  }
  function failed(error: unknown, attempt: number) {
    if (disposed || generation !== attempt) return;
    ++generation;
    closeSocket();
    session.store.setState({ sessionStatus: 'bootstrapping' });
    connection.setState({
      status: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
    });
    if (retry === null) {
      retry = setTimeout(() => {
        retry = null;
        void connect().catch(() => undefined);
      }, 3000);
    }
  }
  function push() {
    if (pushing !== null || connection.getState().status !== 'live') return;
    const attempt = generation;
    const work = (async () => {
      while (
        !disposed &&
        generation === attempt &&
        db !== null &&
        sessionId !== null &&
        socket !== null &&
        connection.getState().status === 'live'
      ) {
        const row = db
          .select()
          .from(config.schema.commands)
          .where(isNull(config.schema.commands.executedIndex))
          .orderBy(asc(config.schema.commands.sessionIndex))
          .all()
          .find(
            command =>
              command.admissionIndex === null && command.payload !== null,
          );
        if (row === undefined) return;
        const currentDb = db;
        const nodeIndex =
          row.nodeIndex ??
          currentDb.transaction(tx => {
            const metadata = tx
              .select()
              .from(config.schema.sessionMetadata)
              .where(eq(config.schema.sessionMetadata.sessionId, sessionId!))
              .get();
            if (metadata === undefined) {
              throw new Error('Agent session metadata missing');
            }
            const next = metadata.pushIndex + 1;
            tx.update(config.schema.commands)
              .set({ nodeId: sessionId!, nodeIndex: next })
              .where(eq(config.schema.commands.sessionIndex, row.sessionIndex))
              .run();
            tx.update(config.schema.sessionMetadata)
              .set({ pushIndex: next })
              .where(eq(config.schema.sessionMetadata.sessionId, sessionId!))
              .run();
            return next;
          });
        updateMetadata();
        const command = Effect.runSync(
          decodeRetainedAggregateSessionCommand({
            ...row,
            nodeId: sessionId,
            nodeIndex,
          }),
        );
        await new Promise<void>((resolve, reject) => {
          admitting = { commandId: row.id, resolve, reject };
          admissionTimeout = setTimeout(
            () => failed(new Error('Command admission uncertain'), attempt),
            15000,
          );
          socket?.send(
            JSON.stringify({
              type: 'pushAggregateCommand',
              command: {
                id: command.id,
                commandName: command.commandName,
                payload: command.payload,
                contractVersion: command.contractVersion,
                aggregateId: command.aggregateId,
                aggregateName: command.aggregateName,
                actorName: command.actorName,
                actorVersion: command.actorVersion,
                sessionName: command.sessionName,
                claims: command.claims,
                nodeId: sessionId,
                nodeIndex,
                systemName: definition.systemName,
              },
            }),
          );
        });
      }
    })();
    pushing = work;
    void work
      .catch(error => failed(error, attempt))
      .finally(() => {
        if (pushing === work) {
          pushing = null;
          if (
            !disposed &&
            generation === attempt &&
            connection.getState().status === 'live' &&
            db !== null &&
            db
              .select()
              .from(config.schema.commands)
              .where(isNull(config.schema.commands.executedIndex))
              .all()
              .some(
                command =>
                  command.admissionIndex === null && command.payload !== null,
              )
          ) {
            push();
          }
        }
      });
  }
  async function connect() {
    if (
      disposed ||
      db === null ||
      runtime === null ||
      bootstrap === null ||
      sessionId === null
    ) {
      return;
    }
    const attempt = ++generation;
    controller?.abort();
    controller = new AbortController();
    closeSocket();
    session.store.setState({ sessionStatus: 'bootstrapping' });
    connection.setState({
      status: session.store.getState().isInitialized
        ? 'reconnecting'
        : 'loading',
      error: null,
    });
    try {
      const boot = await bootstrap({
        signal: controller.signal,
        nodeId: sessionId,
      });
      if (
        disposed ||
        generation !== attempt ||
        db === null ||
        runtime === null ||
        sessionId === null
      ) {
        return;
      }
      const receivedSnapshot = Schema.decodeUnknownSync(
        AggregateSessionSnapshotSchema,
      )(boot.snapshot);
      const snapshot = {
        ...receivedSnapshot,
        resources: receivedSnapshot.resources.map(makeResourceRow),
      };
      const outcomes = Schema.decodeUnknownSync(
        Schema.Array(AggregateBrowserCommandSchema),
      )(boot.outcomes).map(makeBrowserCommand);
      if (
        boot.resolvedThrough !== snapshot.resolvedThrough ||
        outcomes.length !== snapshot.resolvedThrough
      ) {
        throw new Error('Incomplete agent command recovery');
      }
      const claims = Schema.decodeUnknownSync(definition.claimsSchema)(
        snapshot.claims,
      );
      const encodedClaims = Schema.encodeUnknownSync(definition.claimsSchema)({
        aggregateId,
      });
      const initialized = session.store.getState().isInitialized;
      if (!initialized) {
        runtime.runSync(
          applyAggregateSessionSnapshot({
            db,
            definition,
            models: definition.models,
            sessionId,
            snapshot,
            aggregateId: Schema.decodeUnknownSync(
              makeAbbreviationIdSchema('acct'),
            )(aggregateId),
            claims: encodedClaims,
            outcomes,
          }),
        );
      }
      const lockKey = await runtime.runPromise(
        makeAggregateSessionLockKey(makeAggregateSessionLock(definition)),
      );
      if (disposed || generation !== attempt || db === null) return;
      bindAggregateSession({
        session,
        runtime,
        commitCommand: stageSessionCommandTx,
        handoff: () => {
          try {
            push();
          } catch (error) {
            failed(error, generation);
          }
        },
        state: {
          db,
          schema: config.schema,
          models: definition.models,
          claims,
          aggregateId: snapshot.aggregateId,
          aggregateName: definition.aggregateName,
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          sessionName: definition.sessionName,
          sessionId,
          aggregateSessionLockKey: lockKey,
          isInitialized: true,
          aggregateIndex: initialized
            ? session.store.getState().aggregateIndex!
            : snapshot.aggregateIndex,
          executedIndex: initialized
            ? session.store.getState().executedIndex!
            : snapshot.executedIndex,
          executedHash: initialized
            ? session.store.getState().executedHash!
            : snapshot.executedHash,
          pushIndex: initialized ? session.store.getState().pushIndex! : 0,
          sessionStatus: 'bootstrapping',
          backupState: null,
          nodeState: null,
        },
      });
      updateMetadata();
      connection.setState({ status: 'connecting' });
      const currentSocket = new WebSocket(boot.webSocketUrl);
      socket = currentSocket;
      const current = () =>
        !disposed &&
        generation === attempt &&
        socket === currentSocket &&
        db !== null &&
        runtime !== null &&
        sessionId !== null;
      replayTimeout = setTimeout(
        () => failed(new Error('Agent stream replay timed out'), attempt),
        15000,
      );
      currentSocket.onopen = () => {
        if (!current()) return;
        const state = session.store.getState();
        currentSocket.send(
          JSON.stringify({
            nodeId: sessionId,
            nodeIndex: committedOutcomeIndex(),
            executedIndex: state.executedIndex,
            executedHash: state.executedHash,
          }),
        );
      };
      currentSocket.onmessage = event => {
        if (
          !current() ||
          db === null ||
          runtime === null ||
          sessionId === null
        ) {
          return;
        }
        try {
          const received = Schema.decodeUnknownSync(
            Schema.fromJsonString(Schema.Unknown),
          )(event.data);
          if (
            Array.isArray(received) ||
            (typeof received === 'object' &&
              received !== null &&
              !('type' in received))
          ) {
            const commands = Schema.decodeUnknownSync(
              Schema.Array(AggregateBrowserCommandSchema),
              { onExcessProperty: 'error' },
            )(Array.isArray(received) ? received : [received]);
            runtime.runSync(
              importAggregateNodeCommands({
                db,
                definition,
                sessionId,
                commands: commands.map(makeBrowserCommand),
              }),
            );
            updateMetadata();
            return;
          }
          const message = Schema.decodeUnknownSync(frameSchema)(received);
          if (message.type === 'state-required') {
            throw new Error('Agent stream requires command recovery');
          }
          if (message.type === 'aggregateCommandAdmissionFailed') {
            if (message.id !== admitting?.commandId) {
              throw new Error('Agent command admission reply mismatch');
            }
            throw makeZerospinError(
              Schema.decodeUnknownSync(PublicFailureSchema)(message.failure),
            );
          } else if (message.type === 'aggregateCommandAdmission') {
            const receipt = Schema.decodeUnknownSync(
              Schema.Struct({
                id: makeAbbreviationIdSchema('cmd'),
                nodeIndex: Schema.Int.check(Schema.isGreaterThan(0)),
                admissionIndex: Schema.Int.check(
                  Schema.isGreaterThanOrEqualTo(0),
                ),
              }),
            )(message);
            const pending = admitting;
            const row = db
              .select()
              .from(config.schema.commands)
              .where(eq(config.schema.commands.id, receipt.id))
              .all()
              .find(row => row.nodeIndex === receipt.nodeIndex);
            if (
              pending === null ||
              row === undefined ||
              receipt.id !== pending.commandId ||
              receipt.nodeIndex !== row.nodeIndex
            ) {
              throw new Error('Agent command admission receipt mismatch');
            }
            db.transaction(tx =>
              tx
                .update(config.schema.commands)
                .set({ admissionIndex: receipt.admissionIndex })
                .where(
                  eq(config.schema.commands.sessionIndex, row.sessionIndex),
                )
                .run(),
            );
            admitting = null;
            if (admissionTimeout !== null) clearTimeout(admissionTimeout);
            admissionTimeout = null;
            pending.resolve();
          } else if (message.type === 'replay-complete') {
            const through = Schema.decodeUnknownSync(
              Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
              ),
            )(message.executedIndex);
            if (session.store.getState().executedIndex !== through) {
              throw new Error('Agent replay checkpoint mismatch');
            }
            if (replayTimeout !== null) clearTimeout(replayTimeout);
            replayTimeout = null;
            session.store.setState({ sessionStatus: 'current' });
            connection.setState({ status: 'live', error: null });
            push();
          } else {
            throw new Error(`Unexpected agent stream message ${message.type}`);
          }
        } catch (error) {
          failed(error, attempt);
        }
      };
      currentSocket.onerror = () =>
        failed(new Error('Agent stream interrupted'), attempt);
      currentSocket.onclose = () => {
        if (current()) {
          failed(new Error('Agent stream disconnected; reconnecting'), attempt);
          connection.setState({ status: 'reconnecting' });
        }
      };
    } catch (error) {
      failed(error, attempt);
      throw error;
    }
  }
  function makeRuntime(): ManagedRuntime.ManagedRuntime<unknown, IAnyError>;
  function makeRuntime(): ManagedRuntime.ManagedRuntime<never, IAnyError> {
    const baseLayer = Layer.mergeAll(
      NanoIdFactory,
      UlidMonotonicFactory,
      ErrorLayer,
    );
    return ManagedRuntime.make(
      makeTelemetryLayer(session.store.getState().telemetryCollector).pipe(
        Layer.provideMerge(baseLayer),
      ),
    );
  }
  function initialize(
    input: Parameters<IAgentSession['initialize']>[0],
  ): Promise<void> {
    if (initialization !== null && !disposed) return initialization;
    if (disposal !== null) return disposal.then(() => initialize(input));
    disposed = false;
    const initializingLifetime = ++lifetime;
    aggregateId = input.aggregateId;
    bootstrap = input.bootstrap;
    sessionId = Schema.decodeUnknownSync(makeAbbreviationIdSchema('sesn'))(
      `sesn_${crypto.randomUUID()}`,
    );
    runtime = makeRuntime();

    connection.setState({ status: 'loading', error: null });
    const initializeGeneration = ++generation;
    opening = (async () => {
      const client = await makeInMemorySQLite3(input.sqliteModuleFactory);
      if (disposed || generation !== initializeGeneration) {
        client.sqlite3.close(client.db);
        return;
      }
      try {
        db = makeWaSqliteDrizzle(client, config);
        Effect.runSync(provisionDb({ db, schema: config.schema }));
      } catch (error) {
        client.sqlite3.close(client.db);
        db = null;
        throw error;
      }
    })();
    initialization = opening.then(connect).catch(error => {
      if (!disposed && lifetime === initializingLifetime) {
        connection.setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
      throw error;
    });
    return initialization;
  }
  function dispose(): Promise<void> {
    if (disposal !== null) return disposal;
    disposed = true;
    ++lifetime;
    ++generation;
    controller?.abort();
    if (retry !== null) clearTimeout(retry);
    retry = null;
    closeSocket();
    releaseAggregateSession(session);
    session.store.setState({
      sessionId: null,
      aggregateId: null,
      aggregateName: null,
      actorName: null,
      actorVersion: null,
      claims: null,
      sessionName: null,
      aggregateSessionLockKey: null,
      db: null,
      schema: null,
      models: null,
      isInitialized: false,
      aggregateIndex: null,
      executedIndex: null,
      executedHash: null,
      pushIndex: null,
      sessionStatus: 'released',
      backupState: null,
      nodeState: null,
    });
    connection.setState({ status: 'disposed', error: null });
    const work = (async () => {
      await opening?.catch(() => undefined);
      if (db !== null) {
        db.$client.sqlite3.close(db.$client.db);
        db = null;
      }
      await runtime?.dispose();
      runtime = null;
      initialization = null;
      opening = null;
      pushing = null;
    })();
    disposal = work;
    void work.finally(() => {
      if (disposal === work) disposal = null;
    });
    return work;
  }
  return Object.defineProperty(
    Object.assign(session, { connection, initialize, dispose }),
    'runtime',
    {
      enumerable: false,
      get: () => {
        if (runtime === null) {
          throw makeZerospinError('agent-session-not-initialized');
        }
        return runtime;
      },
    },
  );
}
