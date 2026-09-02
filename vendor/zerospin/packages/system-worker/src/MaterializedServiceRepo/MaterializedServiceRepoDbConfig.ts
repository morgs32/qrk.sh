import {
  EncodedServiceCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import type { IModels } from '@zerospin/core/models/types';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';

export const materializedServiceRepoTables = {
  executionClaims: makeTable({
    name: 'executionClaims',
    shape: {
      serviceIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      chainedAt: primitives.date(),
      command: primitives.json({ schema: EncodedServiceCommandSchema }),
      claimedAt: primitives.date(),
      result: primitives.json({
        schema: ServiceChainedCommandSchema,
        nullable: true,
      }),
    },
  }),
  materializationState: makeTable({
    name: 'materializationState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      serviceIndex: primitives.integer(),
    },
  }),
} satisfies IAnyTables;

export const materializedServiceRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(materializedServiceRepoTables);

export function makeMaterializedServiceRepoDbConfig(props: {
  models: IModels;
}) {
  return makeResourceDbConfig({
    models: props.models,
    otherTables: materializedServiceRepoTables,
  });
}
