import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AdmissionResultSchema } from '../contracts/AdmissionResultSchema.ts';
import type { ExecutionResultSchema } from '../contracts/ExecutionResultSchema.ts';

import type { IAggregateNodeCommandInput } from './types.ts';

export const aggregateNodeMetadata = sqliteTable('nodeMetadata', {
  id: integer().primaryKey(),
  nodeId: text().notNull(),
  sessionKey: text().notNull(),
  initialized: integer({ mode: 'boolean' }).notNull(),
  nextNodeIndex: integer().notNull(),
  outcomeIndex: integer().notNull(),
  changeIndex: integer().notNull(),
  aggregateIndex: integer().notNull(),
  executedIndex: integer().notNull(),
  executedHash: text().notNull(),
  pushPaused: integer({ mode: 'boolean' }).notNull(),
});
export const aggregateNodeCommands = sqliteTable('commands', {
  journalIndex: integer().primaryKey({ autoIncrement: true }),
  changeIndex: integer().notNull().unique(),
  id: text().$type<IAggregateNodeCommandInput['id']>().notNull(),
  nodeIndex: integer().unique(),
  admissionIndex: integer(),
  commandName: text().notNull(),
  payload: text(),
  contractVersion: text(),
  aggregateId: text(),
  aggregateName: text(),
  actorName: text(),
  actorVersion: text(),
  sessionName: text(),
  claims: text({ mode: 'json' }).$type<IAggregateNodeCommandInput['claims']>(),
  staging: text({ mode: 'json' }).$type<
    IAggregateNodeCommandInput['staging']
  >(),
  admission: text({ mode: 'json' }).$type<
    typeof AdmissionResultSchema.Encoded
  >(),
  execution: text({ mode: 'json' }).$type<
    typeof ExecutionResultSchema.Encoded
  >(),
  executedIndex: integer().unique(),
  aggregateIndex: integer(),
  executedHash: text(),
  delta: text({ mode: 'json' }).$type<unknown>(),
});
