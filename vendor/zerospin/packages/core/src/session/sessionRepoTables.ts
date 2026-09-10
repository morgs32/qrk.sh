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
    userIndex: primitives.integer(),
    pushIndex: primitives.integer(),
  },
});

export const sessionMetadataDrizzleSchema =
  makeDrizzleSchemaFromTable(sessionMetadataTable);

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
} satisfies IAnyTables;

export const sessionRepoSchema =
  makeDrizzleSchemasRecordFromTables(sessionRepoTables);
