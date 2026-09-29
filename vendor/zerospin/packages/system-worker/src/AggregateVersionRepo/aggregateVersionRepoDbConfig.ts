import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Schema } from 'effect';

export const aggregateVersionRepoDbConfig = makeDbConfig({
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
    services: makeTable({
      name: 'services',
      shape: {
        serviceName: primitives.text({ nullable: false, unique: true }),
        lastIndex: primitives.integer(),
      },
    }),
    head: makeTable({
      name: 'head',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        aggregateIndex: primitives.integer(),
        executedIndex: primitives.integer(),
        dispositionHash: primitives.text(),
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
        actorName: primitives.text(),
        actorVersion: primitives.text(),
        claims: primitives.json({
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
        acknowledgedAt: primitives.date({ nullable: true }),
        lastDeliveryFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
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
        acknowledgedAt: primitives.date({ nullable: true }),
        lastDeliveryFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
  } satisfies IAnyTables,
});
