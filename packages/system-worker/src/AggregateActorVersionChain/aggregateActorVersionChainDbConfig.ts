import { aggregateBrowserCommandsTable } from '@zerospin/core/aggregateSession/aggregateBrowserCommandsTable';
import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

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
    browserCommands: aggregateBrowserCommandsTable,
  },
});
