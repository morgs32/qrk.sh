import {
  EncodedServiceCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const serviceCommandChainTables = {
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
      serviceIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      chainedAt: primitives.date(),
      command: primitives.json({ schema: EncodedServiceCommandSchema }),
      result: primitives.json({
        schema: ServiceChainedCommandSchema,
        nullable: true,
      }),
      materializedServiceRepoName: primitives.text(),
    },
  }),
  materializedServiceSubscribers: makeTable({
    name: 'materializedServiceSubscribers',
    shape: {
      materializedServiceRepoName: primitives.primaryKey({
        abbreviation: systemWorkerAbbreviations.materializedServiceRepo,
      }),
      currentServiceIndex: primitives.integer({ nullable: true }),
      queuedServiceIndex: primitives.integer({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
  aggregateSubscribers: makeTable({
    name: 'aggregateSubscribers',
    shape: {
      aggregateCommandChainName: primitives.primaryKey({
        abbreviation: systemWorkerAbbreviations.aggregateCommandChain,
      }),
      aggregateId: primitives.text(),
      aggregateName: primitives.text(),
      currentServiceIndex: primitives.integer({ nullable: true }),
      queuedServiceIndex: primitives.integer({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
  materializedServiceFrontendSubscribers: makeTable({
    name: 'materializedServiceFrontendSubscribers',
    shape: {
      materializedServiceFrontendRepoName: primitives.primaryKey({
        abbreviation: systemWorkerAbbreviations.materializedServiceFrontendRepo,
      }),
      userId: primitives.text(),
      frontendName: primitives.text(),
      currentServiceIndex: primitives.integer({ nullable: true }),
      queuedServiceIndex: primitives.integer({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

export const serviceCommandChainDbConfig = makeDbConfig({
  tables: serviceCommandChainTables,
});

export const serviceCommandChainDrizzleSchemas =
  serviceCommandChainDbConfig.schema;
