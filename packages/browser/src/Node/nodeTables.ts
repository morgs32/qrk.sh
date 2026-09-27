import type { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import type { ExecutionSummarySchema } from '@zerospin/core/contracts/ExecutionSummarySchema';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { INodeCommandInput, INodeOutcome } from './types.ts';

export const nodeMetadata = sqliteTable('nodeMetadata', {
  id: integer().primaryKey(),
  nodeId: text().notNull(),
  definitionKey: text().notNull(),
  nextNodeIndex: integer().notNull(),
  outcomeIndex: integer().notNull(),
  aggregateIndex: integer().notNull(),
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
  aggregateId: text().notNull(),
  aggregateName: text().notNull(),
  actorName: text().notNull(),
  actorVersion: text().notNull(),
  sessionName: text().notNull(),
  identity: text({ mode: 'json' })
    .$type<INodeCommandInput['identity']>()
    .notNull(),
  staging: text({ mode: 'json' })
    .$type<INodeCommandInput['staging']>()
    .notNull(),
  admission: text({ mode: 'json' })
    .$type<typeof AdmissionResultSchema.Encoded>()
    .notNull(),
  execution: text({ mode: 'json' })
    .$type<typeof ExecutionSummarySchema.Encoded>()
    .notNull(),
  aggregateIndex: integer(),
  executedIndex: integer(),
  executedHash: text(),
  actorDelta: text({ mode: 'json' }).$type<INodeOutcome['actorDelta']>(),
});
