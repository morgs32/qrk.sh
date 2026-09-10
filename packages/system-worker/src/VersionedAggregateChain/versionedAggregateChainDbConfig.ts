import { AggregateExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable, primitives } from '@zerospin/schema';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
export const versionedAggregateChainDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        outboxIndex: primitives.integer({ primaryKey: true }),
        entry: primitives.json({ schema: AggregateExecutionEntrySchema }),
        executionVersion: primitives.text(),
      },
    }),
    replicaSubscribers: makeTable({
      name: 'replicaSubscribers',
      shape: {
        userVersionedAggregateRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.userVersionedAggregateRepo,
        }),
        userId: primitives.text(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.text({ nullable: true }),
      },
    }),
  },
});
