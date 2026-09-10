import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { makeTable, primitives } from '@zerospin/schema';

export const userVersionedAggregateChainDbConfig = makeDbConfig({
  tables: {
    deltas: makeTable({
      name: 'deltas',
      shape: {
        commandId: primitives.text({ nullable: true }),
        userIndex: primitives.integer({ primaryKey: true }),
        aggregateIndex: primitives.integer(),
        output: primitives.json({
          schema: AggregateFrontendFinalizedCommandSchema,
        }),
      },
      indexes: [
        {
          name: 'userAggregateDeltas_commandId',
          columns: ['commandId'],
          unique: true,
        },
      ],
    }),
  },
});
