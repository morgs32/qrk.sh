import { ServiceExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable, primitives } from '@zerospin/schema';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
export const versionedServiceChainDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        outboxIndex: primitives.integer({ primaryKey: true }),
        entry: primitives.json({ schema: ServiceExecutionEntrySchema }),
        executionVersion: primitives.text(),
      },
    }),
    replicaSubscribers: makeTable({
      name: 'replicaSubscribers',
      shape: {
        frontendVersionedServiceRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.frontendVersionedServiceRepo,
        }),
        userId: primitives.text(),
        frontendName: primitives.text(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.text({ nullable: true }),
      },
    }),
    aggregateSubscribers: makeTable({
      name: 'aggregateSubscribers',
      shape: {
        versionedAggregateRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.versionedAggregateRepo,
        }),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.text({ nullable: true }),
      },
    }),
    aggregateReplicaSubscribers: makeTable({
      name: 'aggregateReplicaSubscribers',
      shape: {
        userVersionedAggregateRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.userVersionedAggregateRepo,
        }),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.text({ nullable: true }),
      },
    }),
  },
});
