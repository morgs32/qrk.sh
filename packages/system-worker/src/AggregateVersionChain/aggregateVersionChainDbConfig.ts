import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const aggregateVersionChainDbConfig = makeDbConfig({
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
        executedIndex: primitives.integer(),
      },
    }),
    aggregateCommands: makeTable({
      name: 'aggregateCommands',
      shape: {
        id: primitives.text(),
        commandName: primitives.text(),
        payload: primitives.text(),
        contractVersion: primitives.text(),
        aggregateId: primitives.text(),
        aggregateName: primitives.text(),
        systemName: primitives.text(),
        aggregateVersion: primitives.text({ nullable: true }),
        nodeId: primitives.text({ nullable: true }),
        automationName: primitives.text({ nullable: true }),
        actorName: primitives.text(),
        actorVersion: primitives.text(),
        identity: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
        }),
        sessionName: primitives.text({ nullable: true }),
        nodeIndex: primitives.integer({ nullable: true }),
        admission: primitives.json({ schema: AdmissionResultSchema }),
        execution: primitives.json({ schema: ExecutionResultSchema }),
        dispositionHash: primitives.text(),
        executedIndex: primitives.integer({ primaryKey: true }),
        aggregateIndex: primitives.integer({ unique: true }),
        executionVersion: primitives.text(),
      },
    }),
    serviceCommands: makeTable({
      name: 'serviceCommands',
      shape: {
        id: primitives.text(),
        commandName: primitives.text(),
        payload: primitives.text(),
        contractVersion: primitives.text(),
        admission: primitives.json({ schema: AdmissionResultSchema }),
        execution: primitives.json({ schema: ExecutionResultSchema }),
        dispositionHash: primitives.text(),
        executedIndex: primitives.integer({ primaryKey: true }),
        serviceName: primitives.text(),
        serviceVersion: primitives.text(),
        serviceIndex: primitives.integer({}),
        executionVersion: primitives.text(),
      },
    }),
    executedCommandsFanoutSubscribers: makeTable({
      name: 'executedCommandsFanoutSubscribers',
      shape: {
        aggregateActorVersionRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.aggregateActorVersionRepo,
        }),
        actorPath: primitives.text(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
  },
});
