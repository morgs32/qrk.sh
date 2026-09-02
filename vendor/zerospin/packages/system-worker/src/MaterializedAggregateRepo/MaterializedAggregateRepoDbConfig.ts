import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import type { IModels } from '@zerospin/core/models/types';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Schema } from 'effect';

export const materializedAggregateRepoTables = {
  executionClaims: makeTable({
    name: 'executionClaims',
    shape: {
      aggregateIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      chainedAt: primitives.date(),
      command: primitives.json({
        schema: Schema.Union([
          EncodedAggregateCommandSchema,
          EncodedServiceCommandSchema,
        ]),
      }),
      claimedAt: primitives.date(),
      result: primitives.json({
        schema: AggregateChainedCommandSchema,
        nullable: true,
      }),
    },
  }),
  materializationState: makeTable({
    name: 'materializationState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      aggregateIndex: primitives.integer(),
    },
  }),
} satisfies IAnyTables;

export const materializedAggregateRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(materializedAggregateRepoTables);

export function makeMaterializedAggregateRepoDbConfig(props: {
  models: IModels;
}) {
  return makeResourceDbConfig({
    models: props.models,
    otherTables: materializedAggregateRepoTables,
  });
}
