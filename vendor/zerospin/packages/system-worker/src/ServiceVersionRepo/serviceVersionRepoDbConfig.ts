import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';

export const serviceVersionRepoDbConfig = makeDbConfig({
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
    head: makeTable({
      name: 'head',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        serviceIndex: primitives.integer(),
        dispositionHash: primitives.text(),
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
        acknowledgedAt: primitives.date({ nullable: true }),
        lastDeliveryFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
  } satisfies IAnyTables,
});
