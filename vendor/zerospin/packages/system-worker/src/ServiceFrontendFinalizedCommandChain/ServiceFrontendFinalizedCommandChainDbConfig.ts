import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';

export const serviceFrontendFinalizedCommandChainTables = {
  commands: makeTable({
    name: 'commands',
    shape: {
      serviceFrontendIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      command: primitives.json({
        schema: ServiceFrontendFinalizedCommandSchema,
      }),
    },
  }),
} satisfies IAnyTables;

export const serviceFrontendFinalizedCommandChainDbConfig = makeDbConfig({
  tables: serviceFrontendFinalizedCommandChainTables,
});

export const serviceFrontendFinalizedCommandChainDrizzleSchemas =
  serviceFrontendFinalizedCommandChainDbConfig.schema;
