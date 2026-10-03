import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/schema';

import { aggregateActorVersionRepoDbConfig } from '../AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.js';

/** Retain the confirmed source row and separate the private completion recipient. */
export const aggregateActorVersionChainDbConfig = makeDbConfig({
  tables: {
    connectionLocks: makeTable({
      name: 'connectionLocks',
      shape: {
        connectionId: primitives.text(),
        lock: primitives.json({ schema: AggregateSessionLockSchema }),
      },
      indexes: [
        {
          name: 'connectionLocks_connectionId',
          columns: ['connectionId'],
          unique: true,
        },
      ],
    }),
    commands: makeTable({
      name: 'commands',
      shape: {
        ...aggregateActorVersionRepoDbConfig.tables.commands.shape,
        completionNodeId: primitives.text({ nullable: true }),
        completionNodeIndex: primitives.integer({ nullable: true }),
        completionSessionName: primitives.text({ nullable: true }),
        completionClaims:
          aggregateActorVersionRepoDbConfig.tables.commands.shape.claims,
      },
      indexes: [
        {
          name: 'commands_executed_index',
          columns: ['executedIndex'],
          unique: true,
        },
        {
          name: 'commands_completion_node',
          columns: ['completionNodeId', 'completionNodeIndex'],
          unique: true,
        },
      ],
    }),
  },
});
