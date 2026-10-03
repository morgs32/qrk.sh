import assert from 'node:assert/strict';

import { encodeShape, primitives } from '@zerospin/schema';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import initSqlJs from 'sql.js';

import type { IAggregateActorOutput } from '../../aggregateSession/types.ts';
import { Node } from '../Node.ts';
import type { INodeCommandInput, INodeDefinition } from '../types.ts';

const SQL = await initSqlJs();
let sqlite = new SQL.Database();
const db = drizzle(async (query, params, method) => {
  const statement = sqlite.prepare(query);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) {
      rows.push(statement.get());
    }
    return { rows: method === 'get' ? (rows[0] ?? []) : rows };
  } finally {
    statement.free();
  }
});
const definition: INodeDefinition = {
  identity: {
    apiUrl: 'https://fixture.test',
    publishableKey: 'fixture',
    systemName: 'fixture',
    kind: 'aggregate',
    targetName: 'account',
    targetVersion: '1.0.0',
    targetId: 'acct_one',
    actorName: 'owner',
    actorVersion: '1.0.0',
    sessionName: 'owner',
    claims: { accountId: 'acct_one' },
    definitionHash: 'fixture',
  },
  lock: {
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
          amount: primitives.integer(),
        }),
      },
    },
  },
};
let node = new Node(db, definition);
await node.initialize(true);
const resource = (amount: number) => ({
  id: 'itm_one',
  modelName: 'item',
  version: '1.0.0',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  amount,
});
const input = (id: INodeCommandInput['id']): INodeCommandInput => ({
  id,
  commandName: 'change',
  payload: '{}',
  contractVersion: '1.0.0',
  targetId: 'acct_one',
  targetName: 'account',
  actorName: 'owner',
  actorVersion: '1.0.0',
  sessionName: 'owner',
  claims: definition.identity.claims,
  staging: {
    result: null,
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
    stagedDelta: { inserted: [], updated: [], deleted: [], operations: [] },
  },
});
const output = (
  index: number,
  id: INodeCommandInput['id'],
  amount: number,
  failure: IAggregateActorOutput['command']['failure'] = null,
): IAggregateActorOutput => ({
  executedIndex: index,
  aggregateIndex: index,
  executedHash: index.toString(16).padStart(64, '0'),
  command: {
    id,
    commandName: 'change',
    failure,
    delta: { upserted: [resource(amount)], deleted: [] },
  },
});
await node.accept(input('cmd_one'));
await node.receiveAggregateOutput(output(1, 'cmd_one', 1));
assert.equal(
  (await node.history({ afterNodeIndex: 0, limit: 20 }))[0]?.executedIndex,
  1,
);
// Another occurrence applies its delta but preserves the first resolving occurrence.
await node.receiveAggregateOutput(output(2, 'cmd_one', 2));
assert.equal(
  (await node.history({ afterNodeIndex: 0, limit: 20 }))[0]?.executedIndex,
  1,
);
assert.equal((await node.snapshot()).resources[0]?.amount, 2);
await assert.rejects(
  node.receiveAggregateOutput({
    ...output(1, 'cmd_one', 1),
    executedHash: 'f'.repeat(64),
  }),
);
await node.accept(input('cmd_two'));
await node.receiveAggregateOutput(output(3, 'cmd_foreign', 3));
// Covered historical outcome resolves a journal entry without applying the stale delta.
const failure = {
  _tag: 'ZerospinError' as const,
  code: 'rejected',
  message: 'Rejected',
  status: 400,
  extra: null,
};
await node.receiveAggregateOutput(output(2, 'cmd_two', 99, failure));
assert.equal((await node.snapshot()).resources[0]?.amount, 3);
assert.equal((await node.snapshot()).metadata.executedIndex, 3);
assert.equal(
  (await node.history({ afterNodeIndex: 1, limit: 20 }))[0]?.failure?.code,
  'rejected',
);
// A bad later resource rolls back both the projected delta and the matching outcome.
await node.accept(input('cmd_three'));
const next = output(4, 'cmd_three', 4);
const invalid = {
  ...next,
  command: {
    ...next.command,
    delta: {
      ...next.command.delta,
      upserted: [
        ...next.command.delta.upserted,
        { ...resource(5), id: 'itm_bad', modelName: 'missing' },
      ],
    },
  },
};
await assert.rejects(node.receiveAggregateOutput(invalid));
assert.equal((await node.snapshot()).resources[0]?.amount, 3);
assert.equal(
  (await node.history({ afterNodeIndex: 2, limit: 20 }))[0]?.executedIndex,
  null,
);
// Restart against retained SQLite, then install a snapshot only when its outcome prefix arrives.
const saved = sqlite.export();
sqlite.close();
sqlite = new SQL.Database(saved);
node = new Node(db, definition);
await node.initialize(true);
await node.beginRecovery({
  executedIndex: 5,
  executedHash: '5'.padStart(64, '0'),
  ownerIndex: 5,
  resolvedThrough: 3,
  resources: [resource(5)],
});
assert.equal((await node.snapshot()).metadata.executedIndex, 3);
await node.receiveAggregateOutput(
  output(4, 'cmd_three', 4, { ...failure, code: 'execution-failed' }),
);
assert.equal((await node.snapshot()).metadata.executedIndex, 5);
assert.equal((await node.snapshot()).metadata.outcomeIndex, 3);
assert.equal((await node.snapshot()).resources[0]?.amount, 5);
assert.equal(
  (await node.history({ afterNodeIndex: 2, limit: 20 }))[0]?.executedIndex,
  4,
);
// Empty selections remain individual contiguous updates; a checkpoint conflict changes nothing.
await node.receiveAggregateOutput({
  ...output(6, 'cmd_empty', 0),
  command: {
    ...output(6, 'cmd_empty', 0).command,
    delta: { upserted: [], deleted: [] },
  },
});
await assert.rejects(
  node.receiveAggregateOutput({
    ...output(6, 'cmd_empty', 0),
    executedHash: 'a'.repeat(64),
  }),
);
assert.equal((await node.snapshot()).metadata.executedIndex, 6);
// Service imports retain the own-command hash while advancing occurrence positions.
sqlite.close();
sqlite = new SQL.Database();
node = new Node(db, {
  ...definition,
  identity: {
    ...definition.identity,
    kind: 'service',
    targetId: 'service',
    targetName: 'service',
  },
});
await node.initialize(true);
await node.accept({
  ...input('cmd_service_one'),
  targetId: 'service',
  targetName: 'service',
});
const serviceOutput = {
  executedIndex: 1,
  serviceIndex: 1,
  serviceHash: 'b'.repeat(64),
  command: {
    id: 'cmd_service_one' as const,
    commandName: 'change',
    delta: { upserted: [resource(1)], deleted: [] },
    failure: null,
  },
};
await node.receiveServiceOutput(serviceOutput);
await node.receiveServiceOutput({
  ...serviceOutput,
  executedIndex: 2,
  command: {
    ...serviceOutput.command,
    delta: { upserted: [resource(2)], deleted: [] },
  },
});
assert.equal((await node.snapshot()).metadata.executedIndex, 2);
assert.equal(
  (await node.history({ afterNodeIndex: 0, limit: 20 }))[0]?.executedIndex,
  1,
);
await node.accept({
  ...input('cmd_service_two'),
  targetId: 'service',
  targetName: 'service',
});
await node.receiveServiceOutput({
  ...serviceOutput,
  executedIndex: 3,
  serviceIndex: 2,
  serviceHash: 'c'.repeat(64),
  command: {
    ...serviceOutput.command,
    id: 'cmd_service_two',
    failure,
    delta: { upserted: [], deleted: [] },
  },
});
assert.equal(
  (await node.history({ afterNodeIndex: 1, limit: 20 }))[0]?.failure?.code,
  'rejected',
);
assert.equal((await node.snapshot()).resources[0]?.amount, 2);
// A changed fixed schema rejects old storage without deleting retained work.
sqlite.exec('PRAGMA user_version = 6');
await assert.rejects(new Node(db, definition).initialize(true));
assert.equal(
  sqlite.exec('SELECT count(*) FROM commands')[0]?.values[0]?.[0],
  2,
);
sqlite.close();
console.log(
  'PASS: ID correlation, repeated occurrences, historical outcomes, rollback, restart, snapshot outcome gating, empty updates and checkpoint conflicts',
);
