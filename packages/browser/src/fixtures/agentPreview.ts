import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import SQLiteFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import {
  makeAgentDbConfig,
  makeAgentQuery,
  readAgentCheckpoint,
} from '@zerospin/core/agent/agentPreviewDb';
import type { IAgentSession } from '@zerospin/core/agent/types';
import type { IAgentSpec } from '@zerospin/core/system/types';
import { encodeShape, primitives } from '@zerospin/schema';

import { makeAgentSession } from '../makeAgentSession.js';

const wasmBinary = readFileSync(
  createRequire(import.meta.url).resolve(
    '@livestore/wa-sqlite/dist/wa-sqlite.wasm',
  ),
);
const sqliteModuleFactory = () => SQLiteFactory({ wasmBinary });
const fixtureAgent: IAgentSpec = {
  name: 'positiveItems',
  aggregateName: 'fixture',
  aggregateVersion: '1.0.0',
  actorName: 'preview',
  actorVersion: '1.0.0',
  query: { modelName: 'item', where: { amount: { gt: 0 } } },
  models: {
    item: {
      modelName: 'item',
      version: '1.0.0',
      abbreviation: 'itm',
      indexes: [],
      properties: encodeShape({
        id: primitives.primaryKey({ abbreviation: 'itm' }),
        modelName: primitives.text(),
        version: primitives.text(),
        createdAt: primitives.date(),
        updatedAt: primitives.date(),
        amount: primitives.integer(),
      }),
    },
  },
};
const resource = (amount: number, id = 'itm_one') => ({
  id,
  modelName: 'item',
  version: '1.0.0',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  amount,
});
const snapshot = (aggregateId = 'acct_one', executedIndex = 0, amount = 1) => ({
  aggregateId,
  aggregateName: 'fixture',
  aggregateVersion: '1.0.0',
  actorName: 'preview',
  actorVersion: '1.0.0',
  sessionName: 'agent:positiveItems',
  claims: { aggregateId },
  aggregateIndex: executedIndex,
  executedIndex,
  executedHash: String(executedIndex).padStart(64, '0'),
  resolvedThrough: 0,
  resources: [resource(amount), resource(0, 'itm_zero')],
});
const output = (index: number, amount: number) => ({
  type: 'aggregateActorOutput',
  output: {
    executedIndex: index,
    executedHash: String(index).padStart(64, '0'),
    aggregateIndex: index,
    command: {
      id: `cmd_fixture${index}`,
      commandName: 'change',
      failure: null,
      delta: { upserted: [resource(amount)], deleted: [] },
    },
  },
});
class FixtureSocket {
  static instances: FixtureSocket[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(readonly url: string) {
    FixtureSocket.instances.push(this);
  }
  send(value: string) {
    this.sent.push(value);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.(new Event('open'));
  }
  message(value: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    );
  }
  disconnect() {
    this.onclose?.(new Event('close'));
  }
}
const previousSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
Object.defineProperty(globalThis, 'WebSocket', {
  configurable: true,
  value: FixtureSocket,
});
const sessions: IAgentSession[] = [];
function rows(session: IAgentSession) {
  const db = session.store.getState().db;
  assert.ok(db);
  return makeAgentQuery(
    db,
    makeAgentDbConfig(fixtureAgent),
    fixtureAgent,
  ).all();
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 6000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Fixture timed out');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
try {
  let bootstraps = 0;
  const one = makeAgentSession({
    agent: fixtureAgent,
    aggregateId: 'acct_one',
    sqliteModuleFactory,
    bootstrap: async () => {
      bootstraps++;
      return {
        snapshot: snapshot(
          'acct_one',
          bootstraps === 1 ? 0 : 3,
          bootstraps === 1 ? 1 : 4,
        ),
        webSocketUrl: 'ws://fixture/one',
      };
    },
  });
  sessions.push(one);
  assert.equal(one.store.getState().db, null);
  await one.initialize();
  assert.equal(rows(one).length, 1);
  const first = FixtureSocket.instances.at(-1)!;
  first.open();
  assert.equal(JSON.parse(first.sent[0]!).nodeIndex, 0);
  // An output committed after snapshot capture is replayed before replay-complete.
  first.message(output(1, 2));
  first.message({ type: 'replay-complete', executedIndex: 1 });
  assert.equal(one.store.getState().status, 'live');
  assert.equal(rows(one)[0]?.amount, 2);
  first.message(output(1, 2));
  assert.equal(rows(one)[0]?.amount, 2);
  // A complete delta cannot partially commit if a later row is invalid.
  const bad = output(2, 3);
  bad.output.command.delta.upserted.push({
    ...resource(4, 'itm_bad'),
    amount: NaN,
  });
  first.message(bad);
  assert.equal(rows(one)[0]?.amount, 2);
  assert.equal(readAgentCheckpoint(one.store.getState().db!).executedIndex, 1);
  await until(
    () => bootstraps === 2 && one.store.getState().status === 'connecting',
  );
  assert.equal(rows(one)[0]?.amount, 4);
  const recovered = FixtureSocket.instances.at(-1)!;
  recovered.open();
  recovered.message({ type: 'replay-complete', executedIndex: 3 });
  recovered.message(output(5, 6));
  assert.equal(one.store.getState().status, 'error');
  assert.equal(rows(one)[0]?.amount, 4);
  await until(
    () => bootstraps === 3 && one.store.getState().status === 'connecting',
  );
  const latest = FixtureSocket.instances.at(-1)!;
  latest.open();
  latest.message({ type: 'replay-complete', executedIndex: 3 });
  latest.disconnect();
  assert.equal(one.store.getState().status, 'reconnecting');
  assert.equal(rows(one)[0]?.amount, 4);
  await until(
    () => bootstraps === 4 && one.store.getState().status === 'connecting',
  );
  const two = makeAgentSession({
    agent: fixtureAgent,
    aggregateId: 'acct_two',
    sqliteModuleFactory,
    bootstrap: async () => ({
      snapshot: snapshot('acct_two', 0, 9),
      webSocketUrl: 'ws://fixture/two',
    }),
  });
  sessions.push(two);
  await two.initialize();
  assert.equal(rows(two)[0]?.amount, 9);
  assert.equal(rows(one)[0]?.amount, 4);
  const oldCallback = FixtureSocket.instances.at(-1)!.onmessage;
  const oldDb = two.store.getState().db!;
  await two.dispose();
  oldCallback?.(
    new MessageEvent('message', { data: JSON.stringify(output(1, 10)) }),
  );
  assert.equal(two.store.getState().status, 'disposed');
  assert.throws(() =>
    makeAgentQuery(oldDb, makeAgentDbConfig(fixtureAgent), fixtureAgent).all(),
  );
  assert.equal(rows(one)[0]?.amount, 4);
  let release: (() => void) | undefined;
  const pending = makeAgentSession({
    agent: fixtureAgent,
    aggregateId: 'acct_one',
    sqliteModuleFactory,
    bootstrap: () =>
      new Promise(resolve => {
        release = () =>
          resolve({
            snapshot: snapshot(),
            webSocketUrl: 'ws://fixture/pending',
          });
      }),
  });
  sessions.push(pending);
  const initializing = pending.initialize();
  await until(() => release !== undefined);
  const socketCount = FixtureSocket.instances.length;
  await pending.dispose();
  release?.();
  await initializing;
  assert.equal(FixtureSocket.instances.length, socketCount);
  assert.equal(pending.store.getState().db, null);
  let acquisitions = 0;
  const cancelled = makeAgentSession({
    agent: fixtureAgent,
    aggregateId: 'acct_one',
    sqliteModuleFactory: async () => {
      acquisitions++;
      return sqliteModuleFactory();
    },
    bootstrap: async () => {
      throw new Error('Bootstrap must never happen');
    },
  });
  sessions.push(cancelled);
  const cancelledInit = cancelled.initialize();
  await cancelled.dispose();
  await cancelledInit;
  assert.equal(acquisitions, 1);
  assert.equal(cancelled.store.getState().db, null);
  const failed = makeAgentSession({
    agent: fixtureAgent,
    aggregateId: 'acct_one',
    sqliteModuleFactory,
    bootstrap: async () => {
      throw new Error('initialization failed');
    },
  });
  sessions.push(failed);
  await assert.rejects(failed.initialize(), /initialization failed/);
  assert.equal(failed.store.getState().status, 'error');
  assert.equal(failed.store.getState().db, null);
  await failed.dispose();
  const openFailure = makeAgentSession({
    agent: fixtureAgent,
    aggregateId: 'acct_one',
    sqliteModuleFactory: async () => {
      throw new Error('SQLite opening failed');
    },
    bootstrap: async () => {
      throw new Error('Bootstrap must never happen');
    },
  });
  sessions.push(openFailure);
  await assert.rejects(openFailure.initialize(), /SQLite opening failed/);
  assert.equal(openFailure.store.getState().status, 'error');
  assert.equal(openFailure.store.getState().db, null);
  assert.equal(openFailure.dispose(), openFailure.dispose());
  const source = readFileSync(
    new URL('../makeAgentSession.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /(?:from|import\()\s*['"][^'"]*(?:Node|Backup|SharedWorker)/,
  );
  console.log(
    'Agent snapshot/replay race, filtering, duplicate, rollback, gap recovery, reconnect, isolation and disposal fixtures passed',
  );
} finally {
  await Promise.all(sessions.map(session => session.dispose()));
  if (previousSocket === undefined) {
    Reflect.deleteProperty(globalThis, 'WebSocket');
  } else {
    Object.defineProperty(globalThis, 'WebSocket', previousSocket);
  }
}
