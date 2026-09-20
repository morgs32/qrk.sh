import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { AggregateSelectedCommandSchema } from '@zerospin/core/session/AggregateSelectedCommandSchema';
import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

export const selectionVersionedAggregateChainDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        commandId: primitives.text(),
        selectionIndex: primitives.integer({ primaryKey: true }),
        selectionHash: primitives.text(),
        aggregateIndex: primitives.integer(),
        output: primitives.json({
          schema: AggregateSelectedCommandSchema,
        }),
        authentication: primitives.json({
          schema: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
        }),
        frontendName: primitives.text({ nullable: true }),
      },
      indexes: [
        {
          name: 'selectedCommands_commandId',
          columns: ['commandId'],
          unique: true,
        },
      ],
    }),
  },
});
