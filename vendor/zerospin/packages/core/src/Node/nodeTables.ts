import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { INodeCommandInput, INodeOutcome } from './types.ts';
export const nodeMetadata = sqliteTable('nodeMetadata', {
  id: integer().primaryKey(),
  nodeId: text().notNull(),
  definitionKey: text().notNull(),
  initialized: integer({ mode: 'boolean' }).notNull(),
  nextNodeIndex: integer().notNull(),
  outcomeIndex: integer().notNull(),
  ownerIndex: integer().notNull(),
  executedIndex: integer().notNull(),
  executedHash: text().notNull(),
  pushPaused: integer({ mode: 'boolean' }).notNull(),
});
export const nodeCommands = sqliteTable('commands', {
  id: text().$type<INodeCommandInput['id']>().primaryKey(),
  nodeIndex: integer().notNull().unique(),
  commandName: text().notNull(),
  payload: text().notNull(),
  contractVersion: text().notNull(),
  targetId: text().notNull(),
  targetName: text().notNull(),
  actorName: text().notNull(),
  actorVersion: text().notNull(),
  sessionName: text().notNull(),
  claims: text({ mode: 'json' }).$type<INodeCommandInput['claims']>().notNull(),
  staging: text({ mode: 'json' })
    .$type<INodeCommandInput['staging']>()
    .notNull(),
  failure: text({ mode: 'json' }).$type<INodeOutcome['failure']>(),
  ownerIndex: integer(),
  executedIndex: integer(),
  executedHash: text(),
  actorDelta: text({ mode: 'json' }).$type<INodeOutcome['actorDelta']>(),
});
