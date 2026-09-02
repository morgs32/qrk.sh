import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Schema } from 'effect';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const aggregateCommandChainTables = {
  chainState: makeTable({
    name: 'chainState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      haltedAt: primitives.date({ nullable: true }),
      failure: primitives.text({ nullable: true }),
    },
  }),
  commands: makeTable({
    name: 'commands',
    shape: {
      aggregateIndex: primitives.integer({ primaryKey: true }),
      serviceIndex: primitives.integer({ nullable: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      chainedAt: primitives.date(),
      command: primitives.json({
        schema: Schema.Union([
          EncodedAggregateCommandSchema,
          EncodedServiceCommandSchema,
        ]),
      }),
      result: primitives.json({
        schema: AggregateChainedCommandSchema,
        nullable: true,
      }),
      materializedAggregateRepoName: primitives.text(),
    },
  }),
  materializedAggregateSubscribers: makeTable({
    name: 'materializedAggregateSubscribers',
    shape: {
      materializedAggregateRepoName: primitives.primaryKey({
        abbreviation: systemWorkerAbbreviations.materializedAggregateRepo,
      }),
      currentAggregateIndex: primitives.integer({ nullable: true }),
      queuedAggregateIndex: primitives.integer({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
  materializedAggregateFrontendSubscribers: makeTable({
    name: 'materializedAggregateFrontendSubscribers',
    shape: {
      materializedAggregateFrontendRepoName: primitives.primaryKey({
        abbreviation:
          systemWorkerAbbreviations.materializedAggregateFrontendRepo,
      }),
      aggregateId: primitives.text(),
      aggregateName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      currentAggregateIndex: primitives.integer({ nullable: true }),
      queuedAggregateIndex: primitives.integer({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
  serviceSubscriptions: makeTable({
    name: 'serviceSubscriptions',
    shape: {
      serviceName: primitives.text({ unique: true }),
      serviceIndex: primitives.integer({ nullable: true }),
      materializedAggregateRepoName: primitives.text(),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
  serviceReceipts: makeTable({
    name: 'serviceReceipts',
    shape: {
      serviceName: primitives.text(),
      serviceIndex: primitives.integer(),
      canonicalBytes: primitives.text(),
    },
    indexes: [
      {
        name: 'serviceReceipts_service_index_unique',
        columns: ['serviceName', 'serviceIndex'],
        unique: true,
      },
    ],
  }),
} satisfies IAnyTables;

export const aggregateCommandChainDbConfig = makeDbConfig({
  tables: aggregateCommandChainTables,
});

export const aggregateCommandChainDrizzleSchemas =
  aggregateCommandChainDbConfig.schema;
