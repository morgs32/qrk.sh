import {
  applyAgentOutput,
  applyAgentSnapshot,
  makeAgentDbConfig,
  readAgentCheckpoint,
} from '@zerospin/core/agent/agentPreviewDb';
import type {
  IAgentPreviewBootstrap,
  IAgentSession,
  IAgentSessionState,
} from '@zerospin/core/agent/types';
import {
  AggregateActorOutputSchema,
  AggregateSessionSnapshotSchema,
} from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import type { ISQLiteModuleFactory } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/waSqliteModuleFactory/waSqliteModuleFactory';
import { makeWaSqliteDrizzle } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeInMemoryWasmSqliteDb/makeWaSqliteDrizzle/makeWaSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import type { IDb, IWaSqliteClient } from '@zerospin/core/drizzle/types';
import type { IAgentSpec } from '@zerospin/core/system/types';
import { Effect, Schema } from 'effect';
import { createStore } from 'zustand/vanilla';

const frameSchema = Schema.StructWithRest(
  Schema.Struct({ type: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** A mounted read-only preview owns one SQLite connection and one replaceable actor stream. */
export function makeAgentSession(props: {
  agent: IAgentSpec;
  aggregateId: string;
  sqliteModuleFactory?: ISQLiteModuleFactory;
  bootstrap(signal: AbortSignal): Promise<IAgentPreviewBootstrap>;
}): IAgentSession {
  const agent = structuredClone(props.agent);
  const aggregateId = props.aggregateId;
  const config = makeAgentDbConfig(agent);
  const store = createStore<IAgentSessionState>(() => ({
    db: null,
    isInitialized: false,
    status: 'idle',
    error: null,
  }));
  let db: (IDb & { $client: IWaSqliteClient }) | null = null;
  let opening: Promise<void> | null = null;
  let initialization: Promise<void> | null = null;
  let disposal: Promise<void> | null = null;
  let disposed = false;
  let generation = 0;
  let controller: AbortController | null = null;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let replayTimeout: ReturnType<typeof setTimeout> | null = null;
  const clientId = crypto.randomUUID();

  function closeSocket() {
    if (replayTimeout !== null) clearTimeout(replayTimeout);
    replayTimeout = null;
    if (socket !== null) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
      socket = null;
    }
  }
  function failed(error: unknown, attempt: number) {
    if (disposed || generation !== attempt) return;
    closeSocket();
    store.setState({
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
  async function connect() {
    if (disposed || db === null) return;
    const attempt = ++generation;
    controller?.abort();
    controller = new AbortController();
    closeSocket();
    store.setState({
      status: store.getState().isInitialized ? 'reconnecting' : 'loading',
      error: null,
    });
    try {
      const bootstrap = await props.bootstrap(controller.signal);
      if (disposed || generation !== attempt || db === null) return;
      // Broker/RPC snapshots already decode resource dates. JSON HTTP snapshots need the wire codec.
      const snapshot = Schema.decodeUnknownSync(AggregateSessionSnapshotSchema)(
        bootstrap.snapshot,
      );
      if (
        snapshot.aggregateId !== aggregateId ||
        snapshot.aggregateName !== agent.aggregateName ||
        snapshot.aggregateVersion !== agent.aggregateVersion ||
        snapshot.actorName !== agent.actorName ||
        snapshot.actorVersion !== agent.actorVersion ||
        snapshot.sessionName !== `agent:${agent.name}` ||
        snapshot.claims.aggregateId !== aggregateId
      ) {
        throw new Error('Agent snapshot binding mismatch');
      }
      applyAgentSnapshot(db, config, agent, snapshot);
      store.setState({ db, isInitialized: true, status: 'connecting' });
      const currentSocket = new WebSocket(bootstrap.webSocketUrl);
      socket = currentSocket;
      const current = () =>
        !disposed &&
        generation === attempt &&
        socket === currentSocket &&
        db !== null;
      replayTimeout = setTimeout(
        () => failed(new Error('Agent stream replay timed out'), attempt),
        15000,
      );
      currentSocket.onopen = () => {
        if (!current() || db === null) return;
        const checkpoint = readAgentCheckpoint(db);
        currentSocket.send(
          JSON.stringify({
            nodeId: clientId,
            nodeIndex: 0,
            executedIndex: checkpoint.executedIndex,
            executedHash: checkpoint.executedHash,
          }),
        );
      };
      currentSocket.onmessage = event => {
        if (!current() || db === null) return;
        try {
          const message = Schema.decodeUnknownSync(
            Schema.fromJsonString(frameSchema),
          )(event.data);
          if (message.type === 'state-required') {
            throw new Error('Agent stream requires a fresh snapshot');
          }
          if (message.type === 'aggregateActorOutput') {
            const output = Schema.decodeUnknownSync(AggregateActorOutputSchema)(
              message.output,
            );
            applyAgentOutput(db, config, agent, output);
          } else if (message.type === 'replay-complete') {
            const through = Schema.decodeUnknownSync(
              Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
              ),
            )(message.executedIndex);
            if (readAgentCheckpoint(db).executedIndex !== through) {
              throw new Error('Agent replay checkpoint mismatch');
            }
            if (replayTimeout !== null) clearTimeout(replayTimeout);
            replayTimeout = null;
            store.setState({ status: 'live', error: null });
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
        if (!current()) return;
        failed(new Error('Agent stream disconnected; reconnecting'), attempt);
        if (!disposed) store.setState({ status: 'reconnecting' });
      };
    } catch (error) {
      failed(error, attempt);
      throw error;
    }
  }
  function initialize(): Promise<void> {
    if (disposed) return Promise.reject(new Error('Agent session is disposed'));
    if (initialization !== null) return initialization;
    store.setState({ status: 'loading', error: null });
    opening = (async () => {
      const client = await makeInMemorySQLite3(props.sqliteModuleFactory);
      if (disposed) {
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
      if (!disposed) {
        store.setState({
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
    ++generation;
    controller?.abort();
    if (retry !== null) clearTimeout(retry);
    retry = null;
    closeSocket();
    store.setState({
      db: null,
      isInitialized: false,
      status: 'disposed',
      error: null,
    });
    disposal = (async () => {
      await opening?.catch(() => undefined);
      if (db !== null) {
        db.$client.sqlite3.close(db.$client.db);
        db = null;
      }
    })();
    return disposal;
  }
  return Object.freeze({ agent, aggregateId, store, initialize, dispose });
}
