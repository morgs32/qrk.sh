import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AdmissionResultSchema } from '../contracts/AdmissionResultSchema.ts';
import type { ExecutionResultSchema } from '../contracts/ExecutionResultSchema.ts';

import type { IServiceNodeCommandInput } from './types.ts';

export const serviceNodeMetadata = sqliteTable('nodeMetadata', {
  id: integer().primaryKey(),
  nodeId: text().notNull(),
  sessionKey: text().notNull(),
  initialized: integer({ mode: 'boolean' }).notNull(),
  nextNodeIndex: integer().notNull(),
  outcomeIndex: integer().notNull(),
  changeIndex: integer().notNull(),
  serviceIndex: integer().notNull(),
  executedIndex: integer().notNull(),
  serviceHash: text().notNull(),
  pushPaused: integer({ mode: 'boolean' }).notNull(),
});
export const serviceNodeCommands = sqliteTable('commands', {
  journalIndex: integer().primaryKey({ autoIncrement: true }),
  changeIndex: integer().notNull().unique(),
  id: text().$type<IServiceNodeCommandInput['id']>().notNull(),
  nodeIndex: integer().unique(),
  admissionIndex: integer(),
  commandName: text().notNull(),
  payload: text(),
  contractVersion: text(),
  serviceName: text(),
  actorName: text(),
  actorVersion: text(),
  sessionName: text(),
  claims: text({ mode: 'json' }).$type<IServiceNodeCommandInput['claims']>(),
  staging: text({ mode: 'json' }).$type<IServiceNodeCommandInput['staging']>(),
  admission: text({ mode: 'json' }).$type<
    typeof AdmissionResultSchema.Encoded
  >(),
  execution: text({ mode: 'json' }).$type<
    typeof ExecutionResultSchema.Encoded
  >(),
  executedIndex: integer().unique(),
  serviceIndex: integer(),
  serviceHash: text(),
  delta: text({ mode: 'json' }).$type<unknown>(),
});
