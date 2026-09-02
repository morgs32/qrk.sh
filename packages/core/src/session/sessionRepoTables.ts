import {
  makeDrizzleSchemaFromTable,
  makeTable,
  primitives,
  type IAnyTables,
} from '@zerospin/schema';

import { makeDrizzleSchemasRecordFromTables } from '../drizzle/makeDrizzleSchemas.ts';

import {
  sessionCommandJournalShape,
  sessionOptimisticAppliedMutationShape,
} from './sessionCommandShape.ts';

const sessionMetadataTable = makeTable({
  name: 'sessionMetadata',
  shape: {
    sessionId: primitives.primaryKey({ abbreviation: 'sesn' }),
    nextSessionIndex: primitives.integer(),
    aggregateIndex: primitives.integer(),
    frontendIndex: primitives.integer(),
    pushIndex: primitives.integer(),
    systemVersion: primitives.text(),
  },
});

const sessionResolvedPushTable = makeTable({
  name: 'sessionResolvedPush',
  shape: {
    sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
    pushIndex: primitives.integer(),
  },
  indexes: [
    {
      name: 'session_resolved_push_session_push_unique',
      columns: ['sessionId', 'pushIndex'],
      unique: true,
    },
  ],
});

export const sessionMetadataDrizzleSchema =
  makeDrizzleSchemaFromTable(sessionMetadataTable);

export const sessionResolvedPushDrizzleSchema = makeDrizzleSchemaFromTable(
  sessionResolvedPushTable,
);

/** Non-model tables merged with `frontend.models` for session DB adapters. */
export const sessionRepoTables = {
  commandJournal: makeTable({
    name: 'commandJournal',
    shape: sessionCommandJournalShape,
    indexes: [
      {
        name: 'session_command_journal_session_index_unique',
        columns: ['sessionId', 'sessionIndex'],
        unique: true,
      },
    ],
  }),
  optimisticAppliedMutations: makeTable({
    name: 'optimisticAppliedMutations',
    shape: sessionOptimisticAppliedMutationShape,
  }),
  sessionMetadata: sessionMetadataTable,
  sessionResolvedPush: sessionResolvedPushTable,
} satisfies IAnyTables;

export const sessionRepoSchema =
  makeDrizzleSchemasRecordFromTables(sessionRepoTables);
