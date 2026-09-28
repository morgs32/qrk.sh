import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { Node } from '../Node/Node.ts';
import type { INodeCommandInput } from '../Node/types.ts';

import { addItem, definition } from './shopping.ts';

export const command = (id: string): INodeCommandInput => ({
  id: `cmd_${id}`,
  commandName: addItem.commandName,
  payload: JSON.stringify({
    id: `cit_${id}`,
    productId: 'product_one',
    quantity: 1,
  }),
  contractVersion: addItem.version,
  aggregateId: definition.identity.targetId,
  aggregateName: definition.identity.targetName,
  actorName: definition.identity.actorName,
  actorVersion: definition.identity.actorVersion,
  sessionName: definition.identity.sessionName,
  claims: definition.identity.claims,
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
