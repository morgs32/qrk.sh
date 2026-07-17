import { makeDrizzleSchemasRecordFromTables } from '../drizzle/makeDrizzleSchemas.ts';
import { makeTable } from '../models/makeTable.ts';
import { makeDrizzleSchemaFromTable } from '../models/primitiveMaps.ts';
import { primitives } from '../models/primitives.ts';
import type { IAnyTables } from '../models/types.ts';
import { cloudIdAbbreviations } from '../utils/cloudIdAbbreviations.ts';

import {
  sessionExecutedPushedCommandShape,
  sessionFailedCommandShape,
  sessionOptimisticAppliedMutationShape,
  sessionPushedCommandShape,
  sessionStagedCommandShape,
} from './sessionCommandShape.ts';

const sharedWorkerMetadataTable = makeTable({
  name: 'sharedWorkerMetadata',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'wwm' }),
    systemId: primitives.opaqueId({
      abbreviation: cloudIdAbbreviations.systemRecord,
    }),
    generationId: primitives.text(),
    accountName: primitives.text(),
    actorName: primitives.text(),
    frontendName: primitives.text(),
    frontendVersion: primitives.text(),
    actorId: primitives.text(),
    hasState: primitives.boolean(),
    frontendIndex: primitives.integer({ nullable: true }),
  },
});

export const sharedWorkerMetadataDrizzleSchema = makeDrizzleSchemaFromTable(
  sharedWorkerMetadataTable,
);

/** Non-model tables merged with `frontend.models` for session DB adapters. */
export const sessionRepoTables = {
  stagedCommands: makeTable({
    name: 'stagedCommands',
    shape: sessionStagedCommandShape,
  }),
  pushedCommands: makeTable({
    name: 'pushedCommands',
    shape: sessionPushedCommandShape,
  }),
  executedPushedCommands: makeTable({
    name: 'executedPushedCommands',
    shape: sessionExecutedPushedCommandShape,
  }),
  failedCommands: makeTable({
    name: 'failedCommands',
    shape: sessionFailedCommandShape,
  }),
  optimisticAppliedMutations: makeTable({
    name: 'optimisticAppliedMutations',
    shape: sessionOptimisticAppliedMutationShape,
  }),
  sharedWorkerMetadata: sharedWorkerMetadataTable,
} satisfies IAnyTables;

export const sessionRepoSchema =
  makeDrizzleSchemasRecordFromTables(sessionRepoTables);
