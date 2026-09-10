import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import { makeTable, primitives } from '@zerospin/schema';

export const frontendServiceChainDbConfig = makeDbConfig({
  tables: {
    deltas: makeTable({
      name: 'deltas',
      shape: {
        serviceIndex: primitives.integer({ primaryKey: true }),
        output: primitives.json({
          schema: ServiceFrontendFinalizedCommandSchema,
        }),
      },
    }),
  },
});
