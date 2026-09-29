import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const serviceVersionChainDbConfig = makeDbConfig({
  tables: {
    mutations: makeTable({
      name: 'mutations',
      shape: {
        id: primitives.text({ unique: true }),
        commandId: primitives.text(),
        mutationIndex: primitives.integer(),
        modelName: primitives.text(),
        modelVersion: primitives.text(),
        resourceId: primitives.text(),
        operationName: primitives.enum({
          values: ['create', 'delete', 'move', 'replicate', 'update'],
        }),
        operation: primitives.text(),
        appliedAt: primitives.date(),
        previousUpdatedAt: primitives.date({ nullable: true }),
        inverseOperation: primitives.text(),
        serviceIndex: primitives.integer(),
      },
    }),
    commands: makeTable({
      name: 'commands',
      shape: {
        id: primitives.text(),
        commandName: primitives.text(),
        payload: primitives.text(),
        contractVersion: primitives.text(),
        serviceName: primitives.text(),
        serviceVersion: primitives.text(),
        admission: primitives.json({ schema: AdmissionResultSchema }),
        execution: primitives.json({ schema: ExecutionResultSchema }),
        dispositionHash: primitives.text(),
        serviceIndex: primitives.integer({ primaryKey: true }),
        executionVersion: primitives.text(),
      },
    }),
    executedCommandsFanoutSubscribers: makeTable({
      name: 'executedCommandsFanoutSubscribers',
      shape: {
        serviceActorVersionRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.serviceActorVersionRepo,
        }),
        actorPath: primitives.text(),
        actorName: primitives.text(),
        actorVersion: primitives.text(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
    machineResultsSubscribers: makeTable({
      name: 'machineResultsSubscribers',
      shape: {
        serviceMachineRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.serviceMachineRepo,
        }),
        machineName: primitives.text(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
    aggregateSubscribers: makeTable({
      name: 'aggregateSubscribers',
      shape: {
        aggregateVersionRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.aggregateVersionRepo,
        }),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
  },
});
