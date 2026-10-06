import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import SQLiteFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import { makeAgentContract } from '@zerospin/core/agent/makeAgentContract';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import { stageCommand } from '@zerospin/core/aggregateSession/stageCommand/stageCommand';
import type { IAggregateBrowserCommand } from '@zerospin/core/aggregateSession/types';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { primitives } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';

import { makeAgentSession } from '../makeAgentSession.js';

const wasmBinary = readFileSync(
  createRequire(import.meta.url).resolve(
    '@livestore/wa-sqlite/dist/wa-sqlite.wasm',
  ),
);
const sqliteModuleFactory = () => SQLiteFactory({ wasmBinary });
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: {
      amount: primitives.integer(),
      capturedAt: primitives.date(),
      details: primitives.json({
        schema: Schema.Struct({ label: Schema.String }),
      }),
    },
    indexes: [],
  },
);
const change = makeContractVersion(defineContract('change'), {
  version: '1.0.0',
  payload: { amount: primitives.integer() },
  models: { item },
  program: ({ db, payload, models }) =>
    Effect.gen(function* () {
      const row = db.query.item
        .findFirst({ where: { id: { eq: 'itm_one' } } })
        .sync();
      assert.ok(row);
      yield* models.item.update({
        resourceId: 'itm_one',
        attributes: { amount: row.amount + payload.amount },
      });
    }),
});
const authoringDb = makeActorDbVersion({ models: { item } });
function declare() {
  return makeAgentSession({
    systemName: 'fixture',
    sessionName: 'positiveItems',
    aggregateName: 'fixture',
    aggregateVersion: '1.0.0',
    actorName: 'admin',
    actorVersion: '1.0.0',
    claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
    db: authoringDb,
    selections: {
      item: authoringDb.query.item.findMany({ where: { amount: { gt: 0 } } }),
    },
    contracts: {
      change: makeAgentContract({
        contractVersion: change,
        model: item,
        bind: {},
      }),
    },
  });
}
/** These declarations are compiled by browser:lib and are never initialized. */
function declarationTypeChecks() {
  const props = {
    systemName: 'fixture',
    sessionName: 'positiveItems',
    aggregateName: 'fixture',
    aggregateVersion: '1.0.0',
    actorName: 'admin',
    actorVersion: '1.0.0',
    claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
    db: authoringDb,
  };
  makeAgentSession({
    ...props,
    selections: {},
    contracts: {
      // @ts-expect-error A row command must refer to one of the declared selections.
      change: makeAgentContract({
        contractVersion: change,
        model: item,
        bind: {},
      }),
    },
  });
  makeAgentSession({
    ...props,
    selections: {
      // @ts-expect-error Selection names must match models in the authored database.
      missing: authoringDb.query.item.findMany({}),
    },
    contracts: {},
  });
  makeAgentSession({
    ...props,
    selections: {
      // @ts-expect-error Partial model rows cannot be used as selections.
      item: authoringDb.query.item.findMany({ columns: { amount: true } }),
    },
    contracts: {},
  });
}
void declarationTypeChecks;

const resource = (amount: number) => ({
  id: 'itm_one',
  modelName: 'item',
  version: '1.0.0',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  amount,
  capturedAt: new Date(
    Number.isFinite(amount) ? amount * 1000 : 0,
  ).toISOString(),
  details: JSON.stringify({ label: String(amount) }),
});
const hash = (index: number) => String(index).padStart(64, '0');
const snapshot = (
  aggregateId = 'acct_one',
  executedIndex = 0,
  amount = 1,
  resolvedThrough = 0,
) => ({
  aggregateId,
  aggregateName: 'fixture',
  aggregateVersion: '1.0.0',
  actorName: 'admin',
  actorVersion: '1.0.0',
  sessionName: 'positiveItems',
  claims: { aggregateId },
  aggregateIndex: executedIndex,
  executedIndex,
  executedHash: hash(executedIndex),
  resolvedThrough,
  resources: [resource(amount)],
});
function output(
  index: number,
  id: string,
  amount: number | null,
  failed = false,
): IAggregateBrowserCommand {
  return {
    executedIndex: index,
    aggregateIndex: index,
    executedHash: hash(index),

    id: Schema.decodeUnknownSync(
      Schema.TemplateLiteral(['cmd_', Schema.String]),
    )(id),
    commandName: 'change',
    admission: {
      status: 'succeeded',
      startedAt: new Date(0),
      completedAt: new Date(1),
    },
    execution: failed
      ? {
          status: 'failed',
          startedAt: new Date(0),
          completedAt: new Date(1),
          failure: {
            _tag: 'ZerospinError',
            code: 'declined',
            message: 'Authoritative rejection',
            status: null,
            extra: null,
          },
        }
      : {
          status: 'succeeded',
          contractVersion: '1.0.0',
          result: null,
          startedAt: new Date(0),
          completedAt: new Date(1),
        },
    delta: {
      upserted: amount === null ? [] : [resource(amount)],
      deleted: [],
    },
  };
}
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
const sessions: ReturnType<typeof declare>[] = [];
function amount(session: ReturnType<typeof declare>) {
  const db = session.store.getState().db;
  assert.ok(db);
  return db.query.item.findFirst().sync()?.amount;
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 7000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Fixture timed out');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
try {
  let acquired = 0;
  let bootstraps = 0;
  let recovered: IAggregateBrowserCommand[] = [];
  const one = declare();
  sessions.push(one);
  assert.equal(one.store.getState().db, null);
  assert.equal(one.connection.getState().status, 'idle');
  assert.throws(() => one.runtime);
  assert.equal(
    stageCommand({
      session: one,
      contractName: 'change',
      payload: { amount: 1 },
    })._tag,
    'Failure',
  );
  await one.initialize({
    aggregateId: 'acct_one',
    sqliteModuleFactory: async () => {
      acquired++;
      return sqliteModuleFactory();
    },
    bootstrap: async ({ nodeId }) => {
      assert.ok(nodeId.startsWith('sesn_'));
      bootstraps++;
      const state = snapshot(
        'acct_one',
        recovered.length,
        recovered.length === 0 ? 1 : 6,
        recovered.length,
      );
      return {
        snapshot: JSON.parse(JSON.stringify(state)),
        webSocketUrl: 'ws://fixture/one',
        outcomes: JSON.parse(JSON.stringify(recovered)),
        resolvedThrough: recovered.length,
      };
    },
  });
  assert.equal(acquired, 1);
  assert.equal(amount(one), 1);
  const initialDb = one.store.getState().db;
  assert.ok(initialDb);
  assert.equal(
    initialDb.query.item.findFirst().sync()?.capturedAt.getTime(),
    1000,
  );
  assert.deepEqual(initialDb.query.item.findFirst().sync()?.details, {
    label: '1',
  });
  assert.equal(
    Schema.decodeUnknownSync(Schema.Array(item.table.codec))(
      one.definition.capturedSelections.item.all(initialDb, {
        aggregateId: 'acct_one',
      }),
    ).length,
    1,
  );
  assert.equal(
    stageCommand({
      session: one,
      contractName: 'change',
      payload: { amount: 1 },
    })._tag,
    'Failure',
  );
  const first = FixtureSocket.instances.at(-1)!;
  first.open();
  first.message({ type: 'replay-complete', executedIndex: 0 });
  assert.equal(one.connection.getState().status, 'live');
  const stagedOne = stageCommand({
    session: one,
    contractName: 'change',
    payload: { amount: 2 },
  });
  assert.equal(stagedOne._tag, 'Success');
  if (stagedOne._tag !== 'Success') throw new Error('Staging failed');
  assert.equal(amount(one), 3);
  assert.equal(
    Schema.decodeUnknownSync(Schema.Array(item.table.codec))(
      one.definition.capturedSelections.item.all(initialDb, {
        aggregateId: 'acct_one',
      }),
    )[0]?.amount,
    3,
  );
  const stagedTwo = stageCommand({
    session: one,
    contractName: 'change',
    payload: { amount: 5 },
  });
  assert.equal(stagedTwo._tag, 'Success');
  if (stagedTwo._tag !== 'Success') throw new Error('Staging failed');
  assert.equal(stagedOne.success.sessionIndex, 1);
  assert.equal(stagedTwo.success.sessionIndex, 2);
  const originalRows = initialDb
    .select()
    .from(sessionRepoDbConfig.schema.commands)
    .all();
  assert.deepEqual(
    originalRows.map(row => row.sessionIndex),
    [1, 2],
  );
  assert.equal(amount(one), 8);
  await until(() => first.sent.length === 2);
  const pushedOne = JSON.parse(first.sent[1]!);
  assert.equal(pushedOne.type, 'pushAggregateCommand');
  assert.equal(pushedOne.command.id, stagedOne.success.id);
  assert.equal(pushedOne.command.payload, JSON.stringify({ amount: 2 }));
  assert.equal(pushedOne.command.nodeIndex, 1);
  assert.equal('sessionIndex' in pushedOne.command, false);
  assert.equal('journalIndex' in pushedOne.command, false);
  first.message({
    type: 'aggregateCommandAdmission',
    id: stagedOne.success.id,
    nodeIndex: 1,
    admissionIndex: 1,
  });
  await until(() => first.sent.length === 3);
  const pushedTwo = JSON.parse(first.sent[2]!);
  assert.equal(pushedTwo.command.nodeIndex, 2);
  assert.equal(pushedTwo.command.nodeId, pushedOne.command.nodeId);
  const rejected = output(1, stagedOne.success.id, null, true);
  first.message(rejected);
  assert.equal(amount(one), 6); // Failed first command rewinds and replays only the second.
  const secondOutcome = output(2, stagedTwo.success.id, 6);
  recovered = [rejected, secondOutcome];
  first.disconnect();
  assert.equal(one.connection.getState().status, 'reconnecting');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(one.connection.getState().status, 'reconnecting');
  assert.equal(amount(one), 6);
  await until(
    () => bootstraps === 2 && one.connection.getState().status === 'connecting',
  );
  assert.equal(amount(one), 6); // Outcome recovery prevents reapplying the uncertain second push.
  let resumed = FixtureSocket.instances.at(-1)!;
  resumed.open();
  resumed.message([secondOutcome]);
  resumed.message({ type: 'replay-complete', executedIndex: 2 });
  assert.equal(one.connection.getState().error, null);
  assert.equal(one.connection.getState().status, 'live');
  assert.equal(
    initialDb.query.item.findFirst().sync()?.capturedAt.getTime(),
    6000,
  );
  assert.deepEqual(initialDb.query.item.findFirst().sync()?.details, {
    label: '6',
  });

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(resumed.sent.length, 1);
  assert.equal(JSON.parse(resumed.sent[0]!).nodeId, pushedOne.command.nodeId);
  const journal = one.store
    .getState()
    .db!.select()
    .from(sessionRepoDbConfig.schema.commands)
    .all();
  assert.equal(journal.length, 2);
  assert.deepEqual(
    journal.map(row => ({
      id: row.id,
      sessionIndex: row.sessionIndex,
      sessionId: row.sessionId,
    })),
    originalRows.map(row => ({
      id: row.id,
      sessionIndex: row.sessionIndex,
      sessionId: row.sessionId,
    })),
    'Push, admission, settlement and reconnect preserve retained occurrence keys',
  );
  assert.ok(journal.every(entry => entry.executedIndex !== null));
  const confirmedSecond = journal.find(
    entry => entry.id === stagedTwo.success.id,
  );
  assert.ok(confirmedSecond?.actorDelta);
  assert.deepEqual(
    JSON.parse(confirmedSecond.actorDelta),
    JSON.parse(JSON.stringify(secondOutcome.delta)),
    'Row normalization preserves the received Date/JSON actor delta in the journal',
  );
  resumed.message(secondOutcome);
  assert.equal(amount(one), 6);
  assert.equal(
    initialDb.select().from(sessionRepoDbConfig.schema.sessionMetadata).get()
      ?.nextSessionIndex,
    3,
  );
  const malformed = output(3, 'cmd_invalid', 100);
  const malformedFrame = {
    ...malformed,
    delta: {
      ...malformed.delta,
      upserted: [
        ...malformed.delta.upserted,
        { ...resource(Number.NaN), id: 'itm_bad' },
      ],
    },
  };
  let nextBootstrap = bootstraps + 1;
  resumed.message(malformedFrame);
  assert.equal(one.connection.getState().status, 'error');
  assert.equal(amount(one), 6);
  assert.equal(one.store.getState().executedIndex, 2);
  await until(
    () =>
      bootstraps === nextBootstrap &&
      one.connection.getState().status === 'connecting',
  );
  resumed = FixtureSocket.instances.at(-1)!;
  resumed.open();
  resumed.message({ type: 'replay-complete', executedIndex: 2 });
  nextBootstrap = bootstraps + 1;
  resumed.message(output(4, 'cmd_gap', 100));
  assert.equal(one.connection.getState().status, 'error');
  assert.equal(amount(one), 6);
  await until(
    () =>
      bootstraps === nextBootstrap &&
      one.connection.getState().status === 'connecting',
  );
  resumed = FixtureSocket.instances.at(-1)!;
  resumed.open();
  resumed.message({ type: 'replay-complete', executedIndex: 2 });
  const retryCommand = stageCommand({
    session: one,
    contractName: 'change',
    payload: { amount: 1 },
  });
  assert.equal(retryCommand._tag, 'Success');
  if (retryCommand._tag !== 'Success') throw new Error('Staging failed');
  await until(() => resumed.sent.length === 2);
  const uncertainEnvelope = JSON.parse(resumed.sent[1]!).command;
  nextBootstrap = bootstraps + 1;
  resumed.disconnect();
  await until(
    () =>
      bootstraps === nextBootstrap &&
      one.connection.getState().status === 'connecting',
  );
  assert.equal(amount(one), 7);
  const retrySocket = FixtureSocket.instances.at(-1)!;
  retrySocket.open();
  retrySocket.message({ type: 'replay-complete', executedIndex: 2 });
  await until(() => retrySocket.sent.length === 2);
  assert.deepEqual(JSON.parse(retrySocket.sent[1]!).command, uncertainEnvelope);
  const two = declare();
  sessions.push(two);
  await two.initialize({
    aggregateId: 'acct_two',
    sqliteModuleFactory,
    bootstrap: async () => ({
      snapshot: JSON.parse(JSON.stringify(snapshot('acct_two', 0, 9))),
      webSocketUrl: 'ws://fixture/two',
      outcomes: [],
      resolvedThrough: 0,
    }),
  });
  assert.equal(amount(two), 9);
  assert.equal(amount(one), 7);
  const twoSocket = FixtureSocket.instances.at(-1)!;
  twoSocket.open();
  twoSocket.message({ type: 'replay-complete', executedIndex: 0 });
  twoSocket.message(output(1, 'cmd_row_codec', 13));
  assert.equal(amount(two), 13);
  const secondDb = two.store.getState().db;
  assert.ok(secondDb);
  assert.equal(
    secondDb.query.item.findFirst().sync()?.capturedAt.getTime(),
    13000,
  );
  assert.deepEqual(secondDb.query.item.findFirst().sync()?.details, {
    label: '13',
  });
  const firstReceived = secondDb
    .select()
    .from(sessionRepoDbConfig.schema.commands)
    .get();
  assert.ok(firstReceived);
  assert.equal(firstReceived.sessionIndex, 1);
  assert.equal(firstReceived.sessionId, null);
  assert.equal(firstReceived.payload, null);
  const stagedAfterReceived = stageCommand({
    session: two,
    contractName: 'change',
    payload: { amount: 4 },
  });
  assert.equal(stagedAfterReceived._tag, 'Success');
  if (stagedAfterReceived._tag !== 'Success') throw new Error('Staging failed');
  assert.equal(stagedAfterReceived.success.sessionIndex, 2);
  await until(() => twoSocket.sent.length === 2);
  const afterReceivedPush = JSON.parse(twoSocket.sent[1]!).command;
  assert.equal(afterReceivedPush.id, stagedAfterReceived.success.id);
  assert.equal(afterReceivedPush.nodeIndex, 1);
  twoSocket.message({
    type: 'aggregateCommandAdmission',
    id: stagedAfterReceived.success.id,
    nodeIndex: 1,
    admissionIndex: 8,
  });
  const afterAdmission = secondDb
    .select()
    .from(sessionRepoDbConfig.schema.commands)
    .all();
  assert.deepEqual(afterAdmission[0], firstReceived);
  assert.equal(afterAdmission[1]?.sessionIndex, 2);
  assert.equal(afterAdmission[1]?.admissionIndex, 8);
  twoSocket.message(output(2, stagedAfterReceived.success.id, 17));
  twoSocket.message(output(3, 'cmd_row_codec', 25));
  const repeatedRows = secondDb
    .select()
    .from(sessionRepoDbConfig.schema.commands)
    .all();
  assert.deepEqual(
    repeatedRows.map(row => row.sessionIndex),
    [1, 2, 3],
  );
  assert.deepEqual(repeatedRows[0], firstReceived);
  assert.equal(repeatedRows[2]?.id, firstReceived.id);
  assert.equal(repeatedRows[2]?.executedIndex, 3);
  twoSocket.message(output(3, 'cmd_row_codec', 25));
  assert.deepEqual(
    secondDb.select().from(sessionRepoDbConfig.schema.commands).all(),
    repeatedRows,
  );
  assert.equal(
    secondDb.select().from(sessionRepoDbConfig.schema.sessionMetadata).get()
      ?.nextSessionIndex,
    4,
  );
  assert.deepEqual(
    secondDb
      .select()
      .from(sessionRepoDbConfig.schema.optimisticAppliedOperations)
      .all(),
    [],
  );
  const late = FixtureSocket.instances.at(-1)!.onmessage;
  await two.dispose();
  late?.(
    new MessageEvent('message', {
      data: JSON.stringify(output(1, 'cmd_late', 100)),
    }),
  );
  assert.equal(two.store.getState().db, null);
  assert.equal(amount(one), 7);
  await two.initialize({
    aggregateId: 'acct_three',
    sqliteModuleFactory,
    bootstrap: async () => ({
      snapshot: JSON.parse(JSON.stringify(snapshot('acct_three', 0, 20))),
      webSocketUrl: 'ws://fixture/three',
      outcomes: [],
      resolvedThrough: 0,
    }),
  });
  assert.equal(amount(two), 20);
  let release: (() => void) | undefined;
  const pending = declare();
  sessions.push(pending);
  const initializing = pending.initialize({
    aggregateId: 'acct_one',
    sqliteModuleFactory,
    bootstrap: () =>
      new Promise(resolve => {
        release = () =>
          resolve({
            snapshot: JSON.parse(JSON.stringify(snapshot())),
            webSocketUrl: 'ws://fixture/pending',
            outcomes: [],
            resolvedThrough: 0,
          });
      }),
  });
  await until(() => release !== undefined);
  const count = FixtureSocket.instances.length;
  await pending.dispose();
  release?.();
  await initializing;
  assert.equal(FixtureSocket.instances.length, count);
  const replacement = declare();
  sessions.push(replacement);
  let rejectPrevious: ((cause: unknown) => void) | undefined;
  const previousInitialization = replacement.initialize({
    aggregateId: 'acct_one',
    sqliteModuleFactory,
    bootstrap: () =>
      new Promise((_, reject) => {
        rejectPrevious = reject;
      }),
  });
  const previousRejection = assert.rejects(
    previousInitialization,
    /late previous failure/,
  );
  await until(() => rejectPrevious !== undefined);
  await replacement.dispose();
  await replacement.initialize({
    aggregateId: 'acct_replacement',
    sqliteModuleFactory,
    bootstrap: async () => ({
      snapshot: JSON.parse(JSON.stringify(snapshot('acct_replacement', 0, 40))),
      outcomes: [],
      resolvedThrough: 0,
      webSocketUrl: 'ws://fixture/replacement',
    }),
  });
  rejectPrevious?.(new Error('late previous failure'));
  await previousRejection;
  assert.equal(amount(replacement), 40);
  assert.equal(replacement.connection.getState().status, 'connecting');
  const failed = declare();
  sessions.push(failed);
  await assert.rejects(
    failed.initialize({
      aggregateId: 'acct_one',
      sqliteModuleFactory,
      bootstrap: async () => {
        throw new Error('initialization failed');
      },
    }),
    /initialization failed/,
  );
  assert.equal(failed.connection.getState().status, 'error');
  await failed.dispose();
  const source = readFileSync(
    new URL('../makeAgentSession.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /(?:from|import\()\s*['"][^'"]*(?:(?:Node|AggregateNode|ServiceNode)\/|Backup|SharedWorker)/,
  );
  console.log(
    'Agent cold construction, ordinary optimistic staging, serial push, authoritative rejection, uncertain outcome recovery, unchanged retry, isolation and disposal passed',
  );
} finally {
  await Promise.all(sessions.map(session => session.dispose()));
  if (previousSocket === undefined) {
    Reflect.deleteProperty(globalThis, 'WebSocket');
  } else {
    Object.defineProperty(globalThis, 'WebSocket', previousSocket);
  }
}
