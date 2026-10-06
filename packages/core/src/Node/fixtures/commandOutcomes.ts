import assert from 'node:assert/strict';

import { encodeShape, primitives } from '@zerospin/shapes';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import initSqlJs from 'sql.js';

import { AggregateNode } from '../../AggregateNode/AggregateNode.ts';
import type {
  IAggregateNodeCommandInput,
  IAggregateNodeDefinition,
  IAggregateNodeDelivery,
} from '../../AggregateNode/types.ts';
import type { IAggregateBrowserCommand } from '../../aggregateSession/types.ts';
import { ServiceNode } from '../../ServiceNode/ServiceNode.ts';
import type {
  IServiceNodeCommandInput,
  IServiceNodeDefinition,
  IServiceNodeDelivery,
} from '../../ServiceNode/types.ts';
import type { IServiceBrowserCommand } from '../../serviceSession/types.ts';

const SQL = await initSqlJs();
function makeStore() {
  let sqlite = new SQL.Database();
  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    try {
      statement.bind(params);
      const rows = [];
      while (statement.step()) rows.push(statement.get());
      return { rows: method === 'get' ? (rows[0] ?? []) : rows };
    } finally {
      statement.free();
    }
  });
  return {
    db,
    reopen() {
      const saved = sqlite.export();
      sqlite.close();
      sqlite = new SQL.Database(saved);
    },
    close() {
      sqlite.close();
    },
  };
}
const lock = {
  sessionName: 'owner',
  actorName: 'owner',
  actorVersion: '1.0.0',
  claims: { claimsJsonSchema: {} },
  contracts: {},
  models: {
    item: {
      modelName: 'item',
      abbreviation: 'itm',
      version: '1.0.0',
      indexes: [],
      propertiesShape: encodeShape({
        id: primitives.primaryKey({ abbreviation: 'itm' }),
        modelName: primitives.text(),
        version: primitives.text(),
        createdAt: primitives.date(),
        updatedAt: primitives.date(),
        happenedAt: primitives.date(),
        starredAt: primitives.date({ nullable: true }),
        amount: primitives.integer(),
      }),
    },
  },
};
const resource = (amount: number, starredAt: string | null = null) => ({
  id: 'itm_one',
  modelName: 'item',
  version: '1.0.0',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  happenedAt: new Date(1234),
  starredAt,
  amount,
});
const baselineStarredAt = '2026-10-05T15:00:00.000Z';
const starredAt = '2026-10-05T15:30:00.000Z';
const failure = {
  _tag: 'ZerospinError' as const,
  code: 'rejected',
  message: 'Rejected',
  status: 400,
  extra: null,
};
const AggregateDefinition: IAggregateNodeDefinition = {
  identity: {
    apiUrl: 'https://fixture.test',
    publishableKey: 'fixture',
    systemName: 'fixture',
    aggregateName: 'account',
    aggregateVersion: '1.0.0',
    aggregateId: 'acct_one',
    actorName: 'owner',
    actorVersion: '1.0.0',
    sessionName: 'owner',
    claims: { accountId: 'acct_one' },
    definitionHash: 'fixture',
  },
  lock,
};
const AggregateInput = (
  id: IAggregateNodeCommandInput['id'],
): IAggregateNodeCommandInput => ({
  id,
  commandName: 'change',
  payload: '{}',
  contractVersion: '1.0.0',
  aggregateName: 'account',
  aggregateId: 'acct_one',
  actorName: 'owner',
  actorVersion: '1.0.0',
  sessionName: 'owner',
  claims: AggregateDefinition.identity.claims,
  staging: {
    result: null,
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
    stagedDelta: { inserted: [], updated: [], deleted: [], operations: [] },
  },
});
const AggregateCommand = (
  index: number,
  id: IAggregateNodeCommandInput['id'],
  amount: number,
  executionFailure: typeof failure | null = null,
  starredAt: string | null = null,
): IAggregateBrowserCommand => ({
  id,
  commandName: 'change',
  admission: {
    status: 'succeeded',
    startedAt: new Date(10),
    completedAt: new Date(11),
  },
  execution:
    executionFailure === null
      ? {
          status: 'succeeded',
          contractVersion: '1.0.0',
          result: { amount },
          startedAt: new Date(12),
          completedAt: new Date(13),
        }
      : {
          status: 'failed',
          failure: executionFailure,
          startedAt: new Date(12),
          completedAt: new Date(13),
        },
  delta: { upserted: [resource(amount, starredAt)], deleted: [] },
  executedIndex: index,
  aggregateIndex: index * 2,
  executedHash: index.toString(16).padStart(64, '0'),
});
async function AggregateCases(): Promise<void> {
  // Complete admission/execution data remains a command through SQLite restart and replay.
  const phaseStore = makeStore();
  let phaseNode = new AggregateNode(phaseStore.db, AggregateDefinition);
  await phaseNode.initialize(true);
  await phaseNode.initializeBaseline({
    executedIndex: 0,
    aggregateIndex: 0,
    executedHash: '0'.repeat(64),
    resolvedThrough: 0,
    resources: [],
  });
  await phaseNode.accept(AggregateInput('cmd_admission'));
  const rejected: IAggregateBrowserCommand = {
    ...AggregateCommand(1, 'cmd_admission', 0),
    delta: { upserted: [], deleted: [] },
    admission: {
      status: 'failed',
      startedAt: new Date(10),
      completedAt: new Date(11),
      failure,
    },
    execution: { status: 'skipped', reason: 'admission-failed' },
  };
  await phaseNode.receiveCommand(rejected);
  await phaseNode.accept(AggregateInput('cmd_execution'));
  const failed = AggregateCommand(2, 'cmd_execution', 0, failure);
  await phaseNode.receiveCommand(failed);
  await phaseNode.accept(AggregateInput('cmd_result'));
  const succeeded = AggregateCommand(3, 'cmd_result', 3);
  await phaseNode.receiveCommand(succeeded);
  const privateForeign = {
    ...AggregateCommand(4, 'cmd_foreign_private', 4),
    admission: null,
    execution: null,
  };
  await phaseNode.receiveCommand(privateForeign);
  phaseStore.reopen();
  phaseNode = new AggregateNode(phaseStore.db, AggregateDefinition);
  await phaseNode.initialize(false);
  phaseNode.admissionRejected({
    commandId: 'cmd_admission',
    commandName: 'change',
    failure,
  });
  assert.deepEqual(phaseNode.status().admissionRejection, {
    commandId: 'cmd_admission',
    commandName: 'change',
    failure,
  });
  assert.equal(
    (await phaseNode.snapshot()).state.admissionRejection?.failure,
    failure,
  );
  phaseNode.connectionState('online');
  assert.equal(phaseNode.status().admissionRejection, null);
  const replayed: IAggregateBrowserCommand[] = [];
  let retryDelivered = Promise.withResolvers<void>();
  const unsubscribe = await phaseNode.subscribe(
    { afterChangeIndex: 0 },
    {
      initialize: async () => undefined,
      state: async () => undefined,
      async commands(commands) {
        for (const command of commands)
          if ('executedIndex' in command) replayed.push(command);
        retryDelivered.resolve();
      },
    },
  );
  assert.deepEqual(
    replayed.map(command => ({
      id: command.id,
      admission: command.admission,
      execution: command.execution,
    })),
    [rejected, failed, succeeded, privateForeign].map(command => ({
      id: command.id,
      admission: command.admission,
      execution: command.execution,
    })),
  );
  const originalTerminals = new Map(
    replayed.map(command => [command.id, command]),
  );
  // Retries behind an acknowledged cursor deliver the retained first terminal again.
  for (const input of [
    AggregateInput('cmd_admission'),
    AggregateInput('cmd_execution'),
    AggregateInput('cmd_result'),
  ]) {
    replayed.length = 0;
    retryDelivered = Promise.withResolvers<void>();
    const before = await phaseNode.snapshot();
    const priorHistory = await phaseNode.history({
      afterJournalIndex: 0,
      limit: 200,
    });
    assert.equal(await phaseNode.accept(input), undefined);
    await retryDelivered.promise;
    assert.deepEqual(replayed, [originalTerminals.get(input.id)]);
    const after = await phaseNode.snapshot();
    assert.deepEqual(after.metadata, {
      ...before.metadata,
      changeIndex: before.metadata.changeIndex + 1,
    });
    assert.deepEqual(after.resources, before.resources);
    assert.deepEqual(
      await phaseNode.history({ afterJournalIndex: 0, limit: 200 }),
      priorHistory.map(row =>
        row.id === input.id
          ? { ...row, changeIndex: after.metadata.changeIndex }
          : row,
      ),
    );
  }
  unsubscribe();
  await phaseNode.receiveCommand(rejected);
  await assert.rejects(
    phaseNode.receiveCommand({ ...rejected, execution: failed.execution }),
  );
  phaseStore.close();

  const store = makeStore();
  let node = new AggregateNode(store.db, AggregateDefinition);
  assert.equal(await node.initialize(true), true);
  await node.initializeBaseline({
    executedIndex: 0,
    aggregateIndex: 0,
    executedHash: '0'.repeat(64),
    resolvedThrough: 0,
    resources: [resource(0, baselineStarredAt)],
  });
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(baselineStarredAt),
  );
  assert.equal(await node.accept(AggregateInput('cmd_one')), undefined);
  const accepted = await node.snapshot();
  const first = accepted.unresolvedCommands[0];
  assert.ok(first);
  assert.equal(first.nodeIndex, 1);
  const pendingCommands: IAggregateNodeDelivery[] = [];
  let pendingStatePublications = 0;
  const pendingDelivered = Promise.withResolvers<void>();
  const firstTerminalDelivered =
    Promise.withResolvers<IAggregateBrowserCommand>();
  const detachPending = await node.subscribe(
    { afterChangeIndex: accepted.metadata.changeIndex },
    {
      initialize: async () => {
        throw new Error('Pending retry must replay after the committed cursor');
      },
      state: async () => {
        pendingStatePublications++;
      },
      commands: async commands => {
        pendingCommands.push(...commands);
        for (const command of commands)
          if ('executedIndex' in command)
            firstTerminalDelivered.resolve(command);
        pendingDelivered.resolve();
      },
    },
  );
  await node.accept(AggregateInput('cmd_one'));
  await pendingDelivered.promise;
  assert.deepEqual(pendingCommands, [first]);
  const pendingRetry = await node.snapshot();
  assert.deepEqual(pendingRetry, {
    ...accepted,
    metadata: {
      ...accepted.metadata,
      changeIndex: accepted.metadata.changeIndex + 1,
    },
  });
  const pendingHistory = await node.history({
    afterJournalIndex: 0,
    limit: 200,
  });
  assert.equal(pendingHistory.length, 1);
  assert.equal(pendingHistory[0]?.nodeIndex, first.nodeIndex);
  const statesBeforeConflict = pendingStatePublications;
  await assert.rejects(
    node.accept({
      ...AggregateInput('cmd_one'),
      payload: '{"conflicting":true}',
    }),
    { code: 'node-command-id-conflict' },
  );
  assert.deepEqual(await node.snapshot(), pendingRetry);
  assert.deepEqual(
    await node.history({ afterJournalIndex: 0, limit: 200 }),
    pendingHistory,
  );
  assert.deepEqual(pendingCommands, [first]);
  assert.equal(pendingStatePublications, statesBeforeConflict);
  const admission = {
    status: 'succeeded' as const,
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
  };
  await node.admitted({
    id: first.id,
    nodeIndex: 1,
    admissionIndex: 1,
    admission,
  });
  assert.equal((await node.snapshot()).metadata.aggregateIndex, 0);
  await node.receiveCommand(AggregateCommand(1, 'cmd_one', 1, null, starredAt));
  const firstTerminal = await firstTerminalDelivered.promise;
  detachPending();
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(starredAt),
  );
  assert.equal((await node.snapshot()).metadata.aggregateIndex, 2);
  assert.equal(
    (await node.history({ afterJournalIndex: 0, limit: 200 }))[0]
      ?.admissionIndex,
    1,
  );
  assert.equal(
    (await node.history({ afterJournalIndex: 0, limit: 200 }))[0]
      ?.aggregateIndex,
    2,
  );
  // Distinct occurrences with the same ID retain separate rows and the first settlement.
  await node.receiveCommand(AggregateCommand(2, 'cmd_one', 2));
  assert.equal((await node.snapshot()).resources[0]?.starredAt, null);
  store.reopen();
  node = new AggregateNode(store.db, AggregateDefinition);
  assert.equal(await node.initialize(false), false);
  assert.equal((await node.snapshot()).resources[0]?.starredAt, null);
  const history = await node.history({ afterJournalIndex: 0, limit: 200 });
  assert.equal(history.length, 2);
  assert.equal(history[0]?.executedIndex, 1);
  assert.equal(history[1]?.nodeIndex, null);
  const beforeRetry = await node.snapshot();
  const repeatedCommands: IAggregateNodeDelivery[] = [];
  const repeatedDelivered = Promise.withResolvers<void>();
  const detachRepeated = await node.subscribe(
    {},
    {
      initialize: async snapshot => {
        // A fresh session's snapshot omits the completed command history.
        assert.deepEqual(snapshot.unresolvedCommands, []);
        assert.deepEqual(snapshot.resources, beforeRetry.resources);
      },
      state: async () => undefined,
      commands: async commands => {
        repeatedCommands.push(...commands);
        repeatedDelivered.resolve();
      },
    },
  );
  assert.equal(await node.accept(AggregateInput('cmd_one')), undefined);
  await repeatedDelivered.promise;
  assert.equal(repeatedCommands.length, 2);
  assert.equal(repeatedCommands[0]?.id, 'cmd_one');
  assert.deepEqual(
    repeatedCommands.find(command => 'executedIndex' in command),
    firstTerminal,
  );
  const afterRetry = await node.snapshot();
  assert.deepEqual(afterRetry, {
    ...beforeRetry,
    metadata: {
      ...beforeRetry.metadata,
      changeIndex: beforeRetry.metadata.changeIndex + 1,
    },
  });
  assert.deepEqual(
    await node.history({ afterJournalIndex: 0, limit: 200 }),
    history.map(row =>
      row.nodeIndex === first.nodeIndex
        ? { ...row, changeIndex: afterRetry.metadata.changeIndex }
        : row,
    ),
  );
  await assert.rejects(
    node.accept({
      ...AggregateInput('cmd_one'),
      payload: '{"conflicting":true}',
    }),
    { code: 'node-command-id-conflict' },
  );
  assert.deepEqual(await node.snapshot(), afterRetry);
  assert.equal(repeatedCommands.length, 2);
  detachRepeated();
  // Repeated execution delivery does not allocate another row or change cursor.
  const changeIndex = (await node.snapshot()).metadata.changeIndex;
  await node.receiveCommand(AggregateCommand(2, 'cmd_one', 2));
  assert.equal((await node.snapshot()).metadata.changeIndex, changeIndex);
  await node.accept(AggregateInput('cmd_two'));
  await node.receiveCommand(
    AggregateCommand(3, 'cmd_foreign', 3, null, starredAt),
  );
  await node.receiveCommand(
    AggregateCommand(4, 'cmd_two', 4, failure, starredAt),
  );
  assert.equal((await node.snapshot()).metadata.outcomeIndex, 2);
  assert.equal((await node.snapshot()).resources[0]?.amount, 4);
  assert.equal(
    (await node.history({ afterJournalIndex: 0, limit: 200 })).find(
      row => row.id === 'cmd_two',
    )?.execution?.status,
    'failed',
  );
  // Dates in every authored column survive JSON replay, SQLite, and reopen.
  assert.ok((await node.snapshot()).resources[0]?.happenedAt instanceof Date);
  const identityBefore = (await node.snapshot()).metadata.nodeId;
  store.reopen();
  node = new AggregateNode(store.db, AggregateDefinition);
  assert.equal(await node.initialize(false), false);
  assert.equal((await node.snapshot()).metadata.nodeId, identityBefore);
  assert.equal((await node.snapshot()).metadata.executedIndex, 4);
  assert.ok((await node.snapshot()).resources[0]?.happenedAt instanceof Date);
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(starredAt),
  );
  await assert.rejects(
    node.initializeBaseline({
      executedIndex: 9,
      aggregateIndex: 18,
      executedHash: '9'.repeat(64),
      resolvedThrough: 0,
      resources: [],
    }),
  );
  assert.equal((await node.snapshot()).resources[0]?.amount, 4);
  // Empty selection remains a terminal occurrence and advances contiguous progress.
  await node.receiveCommand({
    ...AggregateCommand(5, 'cmd_empty', 0),
    delta: { upserted: [], deleted: [] },
  });
  assert.equal((await node.snapshot()).metadata.executedIndex, 5);
  assert.equal((await node.snapshot()).resources[0]?.amount, 4);
  // A failed write rolls back retained terminal, resource updates, and checkpoints together.
  await node.accept(AggregateInput('cmd_rollback'));
  const invalid = AggregateCommand(6, 'cmd_rollback', 6);
  await assert.rejects(
    node.receiveCommand({
      ...invalid,
      delta: {
        upserted: [
          ...invalid.delta.upserted,
          { ...resource(7), id: 'itm_bad', modelName: 'missing' },
        ],
        deleted: [],
      },
    }),
  );
  assert.equal((await node.snapshot()).resources[0]?.amount, 4);
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(starredAt),
  );
  assert.equal((await node.snapshot()).metadata.executedIndex, 5);
  assert.equal(
    (await node.history({ afterJournalIndex: 0, limit: 200 })).find(
      row => row.id === 'cmd_rollback',
    )?.executedIndex,
    null,
  );
  store.reopen();
  node = new AggregateNode(store.db, AggregateDefinition);
  await node.initialize(false);
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(starredAt),
  );
  await node.receiveCommand(AggregateCommand(6, 'cmd_rollback', 6));
  assert.equal((await node.snapshot()).resources[0]?.starredAt, null);
  store.reopen();
  node = new AggregateNode(store.db, AggregateDefinition);
  assert.equal(await node.initialize(false), false);
  assert.equal((await node.snapshot()).resources[0]?.starredAt, null);
  await assert.rejects(
    node.receiveCommand({
      ...AggregateCommand(6, 'cmd_rollback', 6),
      executedHash: 'f'.repeat(64),
    }),
  );
  assert.equal(node.status().synchronization, 'blocked');
  node.connectionState('live');
  assert.equal(node.status().synchronization, 'blocked');
  assert.equal((await node.snapshot()).metadata.executedIndex, 6);
  store.close();

  // A baseline can cover historical commands without their occurrences being retained yet.
  const historicalStore = makeStore();
  const historical = new AggregateNode(historicalStore.db, AggregateDefinition);
  await historical.initialize(true);
  await historical.initializeBaseline({
    executedIndex: 10,
    aggregateIndex: 20,
    executedHash: 'a'.repeat(64),
    resolvedThrough: 0,
    resources: [resource(10, baselineStarredAt)],
  });
  await historical.accept(AggregateInput('cmd_historical'));
  await historical.receiveCommand(
    AggregateCommand(4, 'cmd_historical', 999, failure),
  );
  assert.equal((await historical.snapshot()).resources[0]?.amount, 10);
  assert.deepEqual(
    (await historical.snapshot()).resources[0]?.starredAt,
    new Date(baselineStarredAt),
  );
  assert.equal((await historical.snapshot()).metadata.executedIndex, 10);
  assert.equal((await historical.snapshot()).metadata.aggregateIndex, 20);
  assert.equal((await historical.snapshot()).metadata.outcomeIndex, 1);
  await assert.rejects(
    historical.receiveCommand({
      ...AggregateCommand(11, 'cmd_regression', 11),
      aggregateIndex: 19,
    }),
  );
  assert.equal((await historical.snapshot()).resources[0]?.amount, 10);
  historicalStore.close();

  // Backpressure reads durable pages independently; no 50-row or queue-collapse limit.
  const replayStore = makeStore();
  const replayNode = new AggregateNode(replayStore.db, AggregateDefinition);
  await replayNode.initialize(true);
  await replayNode.initializeBaseline({
    executedIndex: 0,
    aggregateIndex: 0,
    executedHash: '0'.repeat(64),
    resolvedThrough: 0,
    resources: [],
  });
  let releaseFirst: () => void = () => undefined;
  const firstPageGate = new Promise<void>(resolve => {
    releaseFirst = resolve;
  });
  let firstPageStarted: () => void = () => undefined;
  const started = new Promise<void>(resolve => {
    firstPageStarted = resolve;
  });
  const delivered: IAggregateBrowserCommand[] = [];
  const staged: string[] = [];
  let lastCursor = 0;
  let done: () => void = () => undefined;
  const complete = new Promise<void>(resolve => {
    done = resolve;
  });
  const detach = await replayNode.subscribe(
    { afterChangeIndex: 0 },
    {
      initialize: async () => {
        throw new Error('Replay must not reinstall a baseline');
      },
      state: async () => undefined,
      commands: async (commands, throughChangeIndex) => {
        firstPageStarted();
        await firstPageGate;
        for (const command of commands) {
          if ('executedIndex' in command) delivered.push(command);
          else staged.push(command.id);
        }
        lastCursor = throughChangeIndex;
        if (delivered.length === 160) done();
      },
    },
  );
  assert.equal(await replayNode.accept(AggregateInput('cmd_known')), undefined);
  await started;
  const blockedSink = await replayNode.snapshot();
  // Both original and repeated acceptance commit while the first callback is paused.
  assert.equal(await replayNode.accept(AggregateInput('cmd_known')), undefined);
  const repeatedWhileBlocked = await replayNode.snapshot();
  assert.deepEqual(repeatedWhileBlocked.metadata, {
    ...blockedSink.metadata,
    changeIndex: blockedSink.metadata.changeIndex + 1,
  });
  assert.deepEqual(
    repeatedWhileBlocked.unresolvedCommands,
    blockedSink.unresolvedCommands,
  );
  assert.equal(lastCursor, 0);
  await replayNode.receiveCommand(AggregateCommand(1, 'cmd_known', 1));
  for (let index = 2; index <= 160; index++) {
    await replayNode.receiveCommand(
      AggregateCommand(index, `cmd_${index}`, index),
    );
  }
  assert.equal(delivered.length, 0);
  releaseFirst();
  await complete;
  assert.equal(delivered.length, 160);
  assert.equal(delivered.at(-1)?.executedIndex, 160);
  assert.ok(staged.includes('cmd_known'));
  assert.equal(lastCursor, (await replayNode.snapshot()).metadata.changeIndex);
  detach();
  // Reconnect only receives changes after the committed cursor, including old-row mutations.
  let resumed: () => void = () => undefined;
  const resumeDone = new Promise<void>(resolve => {
    resumed = resolve;
  });
  const resumeCommands: IAggregateNodeDelivery[] = [];
  const detachResume = await replayNode.subscribe(
    { afterChangeIndex: lastCursor },
    {
      initialize: async () => {
        throw new Error('Reconnect must not replace resources');
      },
      state: async () => undefined,
      commands: async commands => {
        resumeCommands.push(...commands);
        resumed();
      },
    },
  );
  await replayNode.accept(AggregateInput('cmd_resumed'));
  await resumeDone;
  assert.equal(resumeCommands[0]?.id, 'cmd_resumed');
  detachResume();
  replayStore.close();
  // Reconnect readiness waits for the captured replay prefix, without locking writers.
  const catchupStore = makeStore();
  const catchupNode = new AggregateNode(catchupStore.db, AggregateDefinition);
  await catchupNode.initialize(true);
  await catchupNode.initializeBaseline({
    executedIndex: 0,
    aggregateIndex: 0,
    executedHash: '0'.repeat(64),
    resolvedThrough: 0,
    resources: [],
  });
  for (let index = 1; index <= 60; index++)
    await catchupNode.receiveCommand(
      AggregateCommand(index, `cmd_catchup_${index}`, index),
    );
  let releaseCatchup: () => void = () => undefined;
  const catchupGate = new Promise<void>(resolve => {
    releaseCatchup = resolve;
  });
  let catchupStarted: () => void = () => undefined;
  const catchupStart = new Promise<void>(resolve => {
    catchupStarted = resolve;
  });
  let registered = false;
  let committedCursor = 0;
  const subscribing = catchupNode
    .subscribe(
      { afterChangeIndex: 0 },
      {
        initialize: async () => {
          throw new Error('Reconnect cannot initialize');
        },
        state: async () => undefined,
        commands: async (_commands, throughChangeIndex) => {
          catchupStarted();
          await catchupGate;
          committedCursor = throughChangeIndex;
        },
      },
    )
    .then(detach => {
      registered = true;
      return detach;
    });
  await catchupStart;
  assert.equal(registered, false);
  // The paused client cannot hold SQLite or prevent a live occurrence from committing.
  await catchupNode.receiveCommand(
    AggregateCommand(61, 'cmd_catchup_live', 61),
  );
  assert.equal((await catchupNode.snapshot()).metadata.executedIndex, 61);
  releaseCatchup();
  const detachCatchup = await subscribing;
  assert.ok(committedCursor >= 60);
  detachCatchup();
  catchupStore.close();
  console.log('aggregate Node durable command outcomes passed');
}

const ServiceDefinition: IServiceNodeDefinition = {
  identity: {
    apiUrl: 'https://fixture.test',
    publishableKey: 'fixture',
    systemName: 'fixture',
    serviceName: 'catalog',
    serviceVersion: '1.0.0',
    actorName: 'owner',
    actorVersion: '1.0.0',
    sessionName: 'owner',
    claims: { accountId: 'acct_one' },
    definitionHash: 'fixture',
  },
  lock,
};
const ServiceInput = (
  id: IServiceNodeCommandInput['id'],
): IServiceNodeCommandInput => ({
  id,
  commandName: 'change',
  payload: '{}',
  contractVersion: '1.0.0',
  serviceName: 'catalog',
  actorName: 'owner',
  actorVersion: '1.0.0',
  sessionName: 'owner',
  claims: ServiceDefinition.identity.claims,
  staging: {
    result: null,
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
    stagedDelta: { inserted: [], updated: [], deleted: [], operations: [] },
  },
});
const ServiceCommand = (
  index: number,
  id: IServiceNodeCommandInput['id'],
  amount: number,
  executionFailure: typeof failure | null = null,
  starredAt: string | null = null,
): IServiceBrowserCommand => ({
  id,
  commandName: 'change',
  admission: {
    status: 'succeeded',
    startedAt: new Date(10),
    completedAt: new Date(11),
  },
  execution:
    executionFailure === null
      ? {
          status: 'succeeded',
          contractVersion: '1.0.0',
          result: { amount },
          startedAt: new Date(12),
          completedAt: new Date(13),
        }
      : {
          status: 'failed',
          failure: executionFailure,
          startedAt: new Date(12),
          completedAt: new Date(13),
        },
  delta: { upserted: [resource(amount, starredAt)], deleted: [] },
  executedIndex: index,
  serviceIndex: index * 2,
  serviceHash: index.toString(16).padStart(64, '0'),
});
async function ServiceCases(): Promise<void> {
  // Complete admission/execution data remains a command through SQLite restart and replay.
  const phaseStore = makeStore();
  let phaseNode = new ServiceNode(phaseStore.db, ServiceDefinition);
  await phaseNode.initialize(true);
  await phaseNode.initializeBaseline({
    executedIndex: 0,
    serviceIndex: 0,
    serviceHash: '0'.repeat(64),
    resolvedThrough: 0,
    resources: [],
  });
  await phaseNode.accept(ServiceInput('cmd_admission'));
  const rejected: IServiceBrowserCommand = {
    ...ServiceCommand(1, 'cmd_admission', 0),
    delta: { upserted: [], deleted: [] },
    admission: {
      status: 'failed',
      startedAt: new Date(10),
      completedAt: new Date(11),
      failure,
    },
    execution: { status: 'skipped', reason: 'admission-failed' },
  };
  await phaseNode.receiveCommand(rejected);
  await phaseNode.accept(ServiceInput('cmd_execution'));
  const failed = ServiceCommand(2, 'cmd_execution', 0, failure);
  await phaseNode.receiveCommand(failed);
  await phaseNode.accept(ServiceInput('cmd_result'));
  const succeeded = ServiceCommand(3, 'cmd_result', 3);
  await phaseNode.receiveCommand(succeeded);
  const privateForeign = {
    ...ServiceCommand(4, 'cmd_foreign_private', 4),
    admission: null,
    execution: null,
  };
  await phaseNode.receiveCommand(privateForeign);
  phaseStore.reopen();
  phaseNode = new ServiceNode(phaseStore.db, ServiceDefinition);
  await phaseNode.initialize(false);
  phaseNode.admissionRejected({
    commandId: 'cmd_admission',
    commandName: 'change',
    failure,
  });
  assert.deepEqual(phaseNode.status().admissionRejection, {
    commandId: 'cmd_admission',
    commandName: 'change',
    failure,
  });
  assert.equal(
    (await phaseNode.snapshot()).state.admissionRejection?.failure,
    failure,
  );
  phaseNode.connectionState('online');
  assert.equal(phaseNode.status().admissionRejection, null);
  const replayed: IServiceBrowserCommand[] = [];
  let retryDelivered = Promise.withResolvers<void>();
  const unsubscribe = await phaseNode.subscribe(
    { afterChangeIndex: 0 },
    {
      initialize: async () => undefined,
      state: async () => undefined,
      async commands(commands) {
        for (const command of commands)
          if ('executedIndex' in command) replayed.push(command);
        retryDelivered.resolve();
      },
    },
  );
  assert.deepEqual(
    replayed.map(command => ({
      id: command.id,
      admission: command.admission,
      execution: command.execution,
    })),
    [rejected, failed, succeeded, privateForeign].map(command => ({
      id: command.id,
      admission: command.admission,
      execution: command.execution,
    })),
  );
  const originalTerminals = new Map(
    replayed.map(command => [command.id, command]),
  );
  // Retries behind an acknowledged cursor deliver the retained first terminal again.
  for (const input of [
    ServiceInput('cmd_admission'),
    ServiceInput('cmd_execution'),
    ServiceInput('cmd_result'),
  ]) {
    replayed.length = 0;
    retryDelivered = Promise.withResolvers<void>();
    const before = await phaseNode.snapshot();
    const priorHistory = await phaseNode.history({
      afterJournalIndex: 0,
      limit: 200,
    });
    assert.equal(await phaseNode.accept(input), undefined);
    await retryDelivered.promise;
    assert.deepEqual(replayed, [originalTerminals.get(input.id)]);
    const after = await phaseNode.snapshot();
    assert.deepEqual(after.metadata, {
      ...before.metadata,
      changeIndex: before.metadata.changeIndex + 1,
    });
    assert.deepEqual(after.resources, before.resources);
    assert.deepEqual(
      await phaseNode.history({ afterJournalIndex: 0, limit: 200 }),
      priorHistory.map(row =>
        row.id === input.id
          ? { ...row, changeIndex: after.metadata.changeIndex }
          : row,
      ),
    );
  }
  unsubscribe();
  await phaseNode.receiveCommand(rejected);
  await assert.rejects(
    phaseNode.receiveCommand({ ...rejected, execution: failed.execution }),
  );
  phaseStore.close();

  const store = makeStore();
  let node = new ServiceNode(store.db, ServiceDefinition);
  assert.equal(await node.initialize(true), true);
  await node.initializeBaseline({
    executedIndex: 0,
    serviceIndex: 0,
    serviceHash: '0'.repeat(64),
    resolvedThrough: 0,
    resources: [resource(0, baselineStarredAt)],
  });
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(baselineStarredAt),
  );
  assert.equal(await node.accept(ServiceInput('cmd_one')), undefined);
  const accepted = await node.snapshot();
  const first = accepted.unresolvedCommands[0];
  assert.ok(first);
  assert.equal(first.nodeIndex, 1);
  const pendingCommands: IServiceNodeDelivery[] = [];
  let pendingStatePublications = 0;
  const pendingDelivered = Promise.withResolvers<void>();
  const firstTerminalDelivered =
    Promise.withResolvers<IServiceBrowserCommand>();
  const detachPending = await node.subscribe(
    { afterChangeIndex: accepted.metadata.changeIndex },
    {
      initialize: async () => {
        throw new Error('Pending retry must replay after the committed cursor');
      },
      state: async () => {
        pendingStatePublications++;
      },
      commands: async commands => {
        pendingCommands.push(...commands);
        for (const command of commands)
          if ('executedIndex' in command)
            firstTerminalDelivered.resolve(command);
        pendingDelivered.resolve();
      },
    },
  );
  await node.accept(ServiceInput('cmd_one'));
  await pendingDelivered.promise;
  assert.deepEqual(pendingCommands, [first]);
  const pendingRetry = await node.snapshot();
  assert.deepEqual(pendingRetry, {
    ...accepted,
    metadata: {
      ...accepted.metadata,
      changeIndex: accepted.metadata.changeIndex + 1,
    },
  });
  const pendingHistory = await node.history({
    afterJournalIndex: 0,
    limit: 200,
  });
  assert.equal(pendingHistory.length, 1);
  assert.equal(pendingHistory[0]?.nodeIndex, first.nodeIndex);
  const statesBeforeConflict = pendingStatePublications;
  await assert.rejects(
    node.accept({
      ...ServiceInput('cmd_one'),
      payload: '{"conflicting":true}',
    }),
    { code: 'node-command-id-conflict' },
  );
  assert.deepEqual(await node.snapshot(), pendingRetry);
  assert.deepEqual(
    await node.history({ afterJournalIndex: 0, limit: 200 }),
    pendingHistory,
  );
  assert.deepEqual(pendingCommands, [first]);
  assert.equal(pendingStatePublications, statesBeforeConflict);
  const admission = {
    status: 'succeeded' as const,
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
  };
  await node.admitted({
    id: first.id,
    nodeIndex: 1,
    admissionIndex: 1,
    admission,
  });
  assert.equal((await node.snapshot()).metadata.serviceIndex, 0);
  await node.receiveCommand(ServiceCommand(1, 'cmd_one', 1, null, starredAt));
  const firstTerminal = await firstTerminalDelivered.promise;
  detachPending();
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(starredAt),
  );
  assert.equal((await node.snapshot()).metadata.serviceIndex, 2);
  assert.equal(
    (await node.history({ afterJournalIndex: 0, limit: 200 }))[0]
      ?.admissionIndex,
    1,
  );
  assert.equal(
    (await node.history({ afterJournalIndex: 0, limit: 200 }))[0]?.serviceIndex,
    2,
  );
  // Distinct occurrences with the same ID retain separate rows and the first settlement.
  await node.receiveCommand(ServiceCommand(2, 'cmd_one', 2));
  assert.equal((await node.snapshot()).resources[0]?.starredAt, null);
  store.reopen();
  node = new ServiceNode(store.db, ServiceDefinition);
  assert.equal(await node.initialize(false), false);
  assert.equal((await node.snapshot()).resources[0]?.starredAt, null);
  const history = await node.history({ afterJournalIndex: 0, limit: 200 });
  assert.equal(history.length, 2);
  assert.equal(history[0]?.executedIndex, 1);
  assert.equal(history[1]?.nodeIndex, null);
  const beforeRetry = await node.snapshot();
  const repeatedCommands: IServiceNodeDelivery[] = [];
  const repeatedDelivered = Promise.withResolvers<void>();
  const detachRepeated = await node.subscribe(
    {},
    {
      initialize: async snapshot => {
        // A fresh session's snapshot omits the completed command history.
        assert.deepEqual(snapshot.unresolvedCommands, []);
        assert.deepEqual(snapshot.resources, beforeRetry.resources);
      },
      state: async () => undefined,
      commands: async commands => {
        repeatedCommands.push(...commands);
        repeatedDelivered.resolve();
      },
    },
  );
  assert.equal(await node.accept(ServiceInput('cmd_one')), undefined);
  await repeatedDelivered.promise;
  assert.equal(repeatedCommands.length, 2);
  assert.equal(repeatedCommands[0]?.id, 'cmd_one');
  assert.deepEqual(
    repeatedCommands.find(command => 'executedIndex' in command),
    firstTerminal,
  );
  const afterRetry = await node.snapshot();
  assert.deepEqual(afterRetry, {
    ...beforeRetry,
    metadata: {
      ...beforeRetry.metadata,
      changeIndex: beforeRetry.metadata.changeIndex + 1,
    },
  });
  assert.deepEqual(
    await node.history({ afterJournalIndex: 0, limit: 200 }),
    history.map(row =>
      row.nodeIndex === first.nodeIndex
        ? { ...row, changeIndex: afterRetry.metadata.changeIndex }
        : row,
    ),
  );
  await assert.rejects(
    node.accept({
      ...ServiceInput('cmd_one'),
      payload: '{"conflicting":true}',
    }),
    { code: 'node-command-id-conflict' },
  );
  assert.deepEqual(await node.snapshot(), afterRetry);
  assert.equal(repeatedCommands.length, 2);
  detachRepeated();
  // Repeated execution delivery does not allocate another row or change cursor.
  const changeIndex = (await node.snapshot()).metadata.changeIndex;
  await node.receiveCommand(ServiceCommand(2, 'cmd_one', 2));
  assert.equal((await node.snapshot()).metadata.changeIndex, changeIndex);
  await node.accept(ServiceInput('cmd_two'));
  await node.receiveCommand(
    ServiceCommand(3, 'cmd_foreign', 3, null, starredAt),
  );
  await node.receiveCommand(
    ServiceCommand(4, 'cmd_two', 4, failure, starredAt),
  );
  assert.equal((await node.snapshot()).metadata.outcomeIndex, 2);
  assert.equal((await node.snapshot()).resources[0]?.amount, 4);
  assert.equal(
    (await node.history({ afterJournalIndex: 0, limit: 200 })).find(
      row => row.id === 'cmd_two',
    )?.execution?.status,
    'failed',
  );
  // Dates in every authored column survive JSON replay, SQLite, and reopen.
  assert.ok((await node.snapshot()).resources[0]?.happenedAt instanceof Date);
  const identityBefore = (await node.snapshot()).metadata.nodeId;
  store.reopen();
  node = new ServiceNode(store.db, ServiceDefinition);
  assert.equal(await node.initialize(false), false);
  assert.equal((await node.snapshot()).metadata.nodeId, identityBefore);
  assert.equal((await node.snapshot()).metadata.executedIndex, 4);
  assert.ok((await node.snapshot()).resources[0]?.happenedAt instanceof Date);
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(starredAt),
  );
  await assert.rejects(
    node.initializeBaseline({
      executedIndex: 9,
      serviceIndex: 18,
      serviceHash: '9'.repeat(64),
      resolvedThrough: 0,
      resources: [],
    }),
  );
  assert.equal((await node.snapshot()).resources[0]?.amount, 4);
  // Empty selection remains a terminal occurrence and advances contiguous progress.
  await node.receiveCommand({
    ...ServiceCommand(5, 'cmd_empty', 0),
    delta: { upserted: [], deleted: [] },
  });
  assert.equal((await node.snapshot()).metadata.executedIndex, 5);
  assert.equal((await node.snapshot()).resources[0]?.amount, 4);
  // A failed write rolls back retained terminal, resource updates, and checkpoints together.
  await node.accept(ServiceInput('cmd_rollback'));
  const invalid = ServiceCommand(6, 'cmd_rollback', 6);
  await assert.rejects(
    node.receiveCommand({
      ...invalid,
      delta: {
        upserted: [
          ...invalid.delta.upserted,
          { ...resource(7), id: 'itm_bad', modelName: 'missing' },
        ],
        deleted: [],
      },
    }),
  );
  assert.equal((await node.snapshot()).resources[0]?.amount, 4);
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(starredAt),
  );
  assert.equal((await node.snapshot()).metadata.executedIndex, 5);
  assert.equal(
    (await node.history({ afterJournalIndex: 0, limit: 200 })).find(
      row => row.id === 'cmd_rollback',
    )?.executedIndex,
    null,
  );
  store.reopen();
  node = new ServiceNode(store.db, ServiceDefinition);
  await node.initialize(false);
  assert.deepEqual(
    (await node.snapshot()).resources[0]?.starredAt,
    new Date(starredAt),
  );
  await node.receiveCommand(ServiceCommand(6, 'cmd_rollback', 6));
  assert.equal((await node.snapshot()).resources[0]?.starredAt, null);
  store.reopen();
  node = new ServiceNode(store.db, ServiceDefinition);
  assert.equal(await node.initialize(false), false);
  assert.equal((await node.snapshot()).resources[0]?.starredAt, null);
  await assert.rejects(
    node.receiveCommand({
      ...ServiceCommand(6, 'cmd_rollback', 6),
      serviceHash: 'f'.repeat(64),
    }),
  );
  assert.equal(node.status().synchronization, 'blocked');
  node.connectionState('live');
  assert.equal(node.status().synchronization, 'blocked');
  assert.equal((await node.snapshot()).metadata.executedIndex, 6);
  store.close();

  // A baseline can cover historical commands without their occurrences being retained yet.
  const historicalStore = makeStore();
  const historical = new ServiceNode(historicalStore.db, ServiceDefinition);
  await historical.initialize(true);
  await historical.initializeBaseline({
    executedIndex: 10,
    serviceIndex: 20,
    serviceHash: 'a'.repeat(64),
    resolvedThrough: 0,
    resources: [resource(10, baselineStarredAt)],
  });
  await historical.accept(ServiceInput('cmd_historical'));
  await historical.receiveCommand(
    ServiceCommand(4, 'cmd_historical', 999, failure),
  );
  assert.equal((await historical.snapshot()).resources[0]?.amount, 10);
  assert.deepEqual(
    (await historical.snapshot()).resources[0]?.starredAt,
    new Date(baselineStarredAt),
  );
  assert.equal((await historical.snapshot()).metadata.executedIndex, 10);
  assert.equal((await historical.snapshot()).metadata.serviceIndex, 20);
  assert.equal((await historical.snapshot()).metadata.outcomeIndex, 1);
  await assert.rejects(
    historical.receiveCommand({
      ...ServiceCommand(11, 'cmd_regression', 11),
      serviceIndex: 19,
    }),
  );
  assert.equal((await historical.snapshot()).resources[0]?.amount, 10);
  historicalStore.close();

  // Backpressure reads durable pages independently; no 50-row or queue-collapse limit.
  const replayStore = makeStore();
  const replayNode = new ServiceNode(replayStore.db, ServiceDefinition);
  await replayNode.initialize(true);
  await replayNode.initializeBaseline({
    executedIndex: 0,
    serviceIndex: 0,
    serviceHash: '0'.repeat(64),
    resolvedThrough: 0,
    resources: [],
  });
  let releaseFirst: () => void = () => undefined;
  const firstPageGate = new Promise<void>(resolve => {
    releaseFirst = resolve;
  });
  let firstPageStarted: () => void = () => undefined;
  const started = new Promise<void>(resolve => {
    firstPageStarted = resolve;
  });
  const delivered: IServiceBrowserCommand[] = [];
  const staged: string[] = [];
  let lastCursor = 0;
  let done: () => void = () => undefined;
  const complete = new Promise<void>(resolve => {
    done = resolve;
  });
  const detach = await replayNode.subscribe(
    { afterChangeIndex: 0 },
    {
      initialize: async () => {
        throw new Error('Replay must not reinstall a baseline');
      },
      state: async () => undefined,
      commands: async (commands, throughChangeIndex) => {
        firstPageStarted();
        await firstPageGate;
        for (const command of commands) {
          if ('executedIndex' in command) delivered.push(command);
          else staged.push(command.id);
        }
        lastCursor = throughChangeIndex;
        if (delivered.length === 160) done();
      },
    },
  );
  assert.equal(await replayNode.accept(ServiceInput('cmd_known')), undefined);
  await started;
  const blockedSink = await replayNode.snapshot();
  // Both original and repeated acceptance commit while the first callback is paused.
  assert.equal(await replayNode.accept(ServiceInput('cmd_known')), undefined);
  const repeatedWhileBlocked = await replayNode.snapshot();
  assert.deepEqual(repeatedWhileBlocked.metadata, {
    ...blockedSink.metadata,
    changeIndex: blockedSink.metadata.changeIndex + 1,
  });
  assert.deepEqual(
    repeatedWhileBlocked.unresolvedCommands,
    blockedSink.unresolvedCommands,
  );
  assert.equal(lastCursor, 0);
  await replayNode.receiveCommand(ServiceCommand(1, 'cmd_known', 1));
  for (let index = 2; index <= 160; index++) {
    await replayNode.receiveCommand(
      ServiceCommand(index, `cmd_${index}`, index),
    );
  }
  assert.equal(delivered.length, 0);
  releaseFirst();
  await complete;
  assert.equal(delivered.length, 160);
  assert.equal(delivered.at(-1)?.executedIndex, 160);
  assert.ok(staged.includes('cmd_known'));
  assert.equal(lastCursor, (await replayNode.snapshot()).metadata.changeIndex);
  detach();
  // Reconnect only receives changes after the committed cursor, including old-row mutations.
  let resumed: () => void = () => undefined;
  const resumeDone = new Promise<void>(resolve => {
    resumed = resolve;
  });
  const resumeCommands: IServiceNodeDelivery[] = [];
  const detachResume = await replayNode.subscribe(
    { afterChangeIndex: lastCursor },
    {
      initialize: async () => {
        throw new Error('Reconnect must not replace resources');
      },
      state: async () => undefined,
      commands: async commands => {
        resumeCommands.push(...commands);
        resumed();
      },
    },
  );
  await replayNode.accept(ServiceInput('cmd_resumed'));
  await resumeDone;
  assert.equal(resumeCommands[0]?.id, 'cmd_resumed');
  detachResume();
  replayStore.close();
  // Reconnect readiness waits for the captured replay prefix, without locking writers.
  const catchupStore = makeStore();
  const catchupNode = new ServiceNode(catchupStore.db, ServiceDefinition);
  await catchupNode.initialize(true);
  await catchupNode.initializeBaseline({
    executedIndex: 0,
    serviceIndex: 0,
    serviceHash: '0'.repeat(64),
    resolvedThrough: 0,
    resources: [],
  });
  for (let index = 1; index <= 60; index++)
    await catchupNode.receiveCommand(
      ServiceCommand(index, `cmd_catchup_${index}`, index),
    );
  let releaseCatchup: () => void = () => undefined;
  const catchupGate = new Promise<void>(resolve => {
    releaseCatchup = resolve;
  });
  let catchupStarted: () => void = () => undefined;
  const catchupStart = new Promise<void>(resolve => {
    catchupStarted = resolve;
  });
  let registered = false;
  let committedCursor = 0;
  const subscribing = catchupNode
    .subscribe(
      { afterChangeIndex: 0 },
      {
        initialize: async () => {
          throw new Error('Reconnect cannot initialize');
        },
        state: async () => undefined,
        commands: async (_commands, throughChangeIndex) => {
          catchupStarted();
          await catchupGate;
          committedCursor = throughChangeIndex;
        },
      },
    )
    .then(detach => {
      registered = true;
      return detach;
    });
  await catchupStart;
  assert.equal(registered, false);
  // The paused client cannot hold SQLite or prevent a live occurrence from committing.
  await catchupNode.receiveCommand(ServiceCommand(61, 'cmd_catchup_live', 61));
  assert.equal((await catchupNode.snapshot()).metadata.executedIndex, 61);
  releaseCatchup();
  const detachCatchup = await subscribing;
  assert.ok(committedCursor >= 60);
  detachCatchup();
  catchupStore.close();
  console.log('service Node durable command outcomes passed');
}

await AggregateCases();
await ServiceCases();
