import { DatabaseSync } from 'node:sqlite';

import { Node } from '@zerospin/browser/Node/Node';
import type {
  INodeCommandInput,
  INodeDefinition,
} from '@zerospin/browser/Node/types';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

export const definition: INodeDefinition = {
  identity: {
    apiUrl: 'https://api.example.test',
    publishableKey: 'public',
    systemName: 'test',
    kind: 'aggregate',
    targetName: 'account',
    targetVersion: 'v1',
    targetId: 'acct_test',
    actorName: 'owner',
    actorVersion: 'v1',
    sessionName: 'editor',
    identity: { userId: 'one' },
    definitionHash: 'a'.repeat(64),
  },
  lock: {
    sessionName: 'editor',
    actorName: 'owner',
    actorVersion: 'v1',
    identity: { identityJsonSchema: {} },
    contracts: {},
    models: {},
  },
};
export const command = (id: string): INodeCommandInput => ({
  id: `cmd_${id}`,
  commandName: 'change',
  payload: '{}',
  contractVersion: 'v1',
  aggregateId: 'acct_test',
  aggregateName: 'account',
  actorName: 'owner',
  actorVersion: 'v1',
  sessionName: 'editor',
  identity: { userId: 'one' },
  staging: {
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:00.000Z',
    stagedDelta: { inserted: [], updated: [], deleted: [], mutations: [] },
  },
});
export const database = () => {
  const sqlite = new DatabaseSync(':memory:');
  const db = drizzle(async (query, parameters, method) => {
    const statement = sqlite.prepare(query);
    if (method === 'run') {
      statement.run(...parameters);
      return { rows: [] };
    }
    statement.setReturnArrays(true);
    const rows = statement.all(...parameters).map(row => Object.values(row));
    return { rows: method === 'get' ? (rows[0] ?? []) : rows };
  });
  return { db, sqlite };
};
export const fixture = async () => {
  const { db, sqlite } = database();
  const node = new Node(db, definition);
  await node.initialize();
  return { node, db, sqlite };
};

export const admitted = {
  status: 'succeeded' as const,
  startedAt: new Date('2026-01-01'),
  completedAt: new Date('2026-01-01'),
};
export const executed = {
  status: 'succeeded' as const,
  startedAt: new Date('2026-01-01'),
  completedAt: new Date('2026-01-01'),
};
export const rejection = {
  _tag: 'ZerospinError' as const,
  code: 'denied',
  scope: 'actor' as const,
  message: 'Denied',
  status: 403,
  extra: { reason: 'denied' },
};
export const encodedAdmission = {
  ...admitted,
  startedAt: admitted.startedAt.toISOString(),
  completedAt: admitted.completedAt.toISOString(),
};
