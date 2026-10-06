import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/shapes';
import { Schema } from 'effect';

import { AdmissionResultSchema } from '../contracts/AdmissionResultSchema.ts';
import { ExecutionResultSchema } from '../contracts/ExecutionResultSchema.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';

import { AggregateBrowserCommandSchema } from './AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type { IAggregateBrowserCommand } from './types.ts';

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
    admission: primitives.json({
      schema: AdmissionResultSchema,
      nullable: true,
    }),
    execution: primitives.json({
      schema: ExecutionResultSchema,
      nullable: true,
    }),
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

export function makeAggregateBrowserCommand(
  row: typeof aggregateBrowserCommandsTable.codec.Type,
): IAggregateBrowserCommand {
  return Schema.decodeUnknownSync(Schema.toType(AggregateBrowserCommandSchema))(
    {
      executedIndex: row.executedIndex,
      aggregateIndex: row.aggregateIndex,
      executedHash: row.executedHash,
      id: row.id,
      commandName: row.commandName,
      delta: row.delta,
      admission: row.admission,
      execution: row.execution,
    },
  );
}
