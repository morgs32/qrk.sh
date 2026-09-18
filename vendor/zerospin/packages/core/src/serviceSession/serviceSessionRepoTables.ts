import {
  makeDrizzleSchemaFromTable,
  makeTable,
  primitives,
  type IAnyTables,
} from '@zerospin/schema';

import { makeDrizzleSchemasRecordFromTables } from '../drizzle/makeDrizzleSchemasRecordFromTables.ts';

const serviceSessionMetadataTable = makeTable({
  name: 'serviceSessionMetadata',
  shape: {
    sessionId: primitives.primaryKey({ abbreviation: 'sesn' }),
    serviceIndex: primitives.integer(),
    serviceVersion: primitives.text(),
  },
});

export const serviceSessionMetadataDrizzleSchema = makeDrizzleSchemaFromTable(
  serviceSessionMetadataTable,
);

export const serviceSessionRepoTables = {
  serviceSessionMetadata: serviceSessionMetadataTable,
} satisfies IAnyTables;

export const serviceSessionRepoSchema = makeDrizzleSchemasRecordFromTables(
  serviceSessionRepoTables,
);
