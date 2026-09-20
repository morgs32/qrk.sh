import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { ServiceSelectedCommandSchema } from '@zerospin/core/serviceSession/ServiceSelectedCommandSchema';
import { makeTable, primitives } from '@zerospin/schema';

export const frontendServiceChainDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        serviceIndex: primitives.integer({ primaryKey: true }),
        serviceHash: primitives.text(),
        output: primitives.json({
          schema: ServiceSelectedCommandSchema,
        }),
      },
    }),
  },
});
