import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';

export const aggregateFrontendFinalizedCommandChainTables = {
  commands: makeTable({
    name: 'commands',
    shape: {
      frontendIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      command: primitives.json({
        schema: AggregateFrontendFinalizedCommandSchema,
      }),
    },
  }),
} satisfies IAnyTables;

export const aggregateFrontendFinalizedCommandChainDbConfig = makeDbConfig({
  tables: aggregateFrontendFinalizedCommandChainTables,
});

export const aggregateFrontendFinalizedCommandChainDrizzleSchemas =
  aggregateFrontendFinalizedCommandChainDbConfig.schema;
