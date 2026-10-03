import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';

import { AggregateActorOutputSchema } from './AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type { IAggregateActorOutput } from './types.ts';

/** Public projection output and its optional private command-completion recipient. */
export const aggregateBrowserCommandsTable = makeTable({
  name: 'browserCommands',
  shape: {
    executedIndex: primitives.integer({ primaryKey: true }),
    aggregateIndex: primitives.integer(),
    executedHash: primitives.text(),
    id: primitives.text(),
    commandName: primitives.text(),
    delta: primitives.json({ schema: ActorDeltaSchema }),
    failure: primitives.json({ schema: PublicFailureSchema, nullable: true }),
    completionNodeId: primitives.text({ nullable: true }),
    completionNodeIndex: primitives.integer({ nullable: true }),
    completionSessionName: primitives.text({ nullable: true }),
    completionClaims: primitives.json({
      schema: Schema.Record(Schema.String, Schema.Unknown),
      nullable: true,
    }),
    lastDeliveryFailure: primitives.json({
      schema: PublicFailureSchema,
      nullable: true,
    }),
  },
  indexes: [
    {
      name: 'browserCommands_completion_node',
      columns: ['completionNodeId', 'completionNodeIndex'],
      unique: true,
    },
  ],
});

export function makeAggregateActorOutput(
  row: typeof aggregateBrowserCommandsTable.codec.Type,
): IAggregateActorOutput {
  return Schema.decodeUnknownSync(Schema.toType(AggregateActorOutputSchema))({
    executedIndex: row.executedIndex,
    aggregateIndex: row.aggregateIndex,
    executedHash: row.executedHash,
    command: {
      id: row.id,
      commandName: row.commandName,
      delta: row.delta,
      failure: row.failure,
    },
  });
}
