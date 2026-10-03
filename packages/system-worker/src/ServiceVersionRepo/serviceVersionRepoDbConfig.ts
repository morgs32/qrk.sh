import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { AsyncCommandInputSchema } from '@zerospin/core/contracts/AsyncCommandInputSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { ServiceCallerSchema } from '@zerospin/core/contracts/ServiceCallerSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';

import {
  asyncOperationsDbConfig,
  operationKeyIndex,
} from '../asyncOperations/asyncOperationsDbConfig.js';
import { forwardedCommandShape } from '../forwardedCommands.js';
import { ownedOperationShape } from '../ownedOperations.js';

export const serviceVersionRepoDbConfig = makeDbConfig({
  tables: {
    ...asyncOperationsDbConfig.tables,
    asyncOperations: makeTable({
      name: 'asyncOperations',
      shape: {
        ...asyncOperationsDbConfig.tables.asyncOperations.shape,
        serviceIndex: primitives.integer(),
      },
      indexes: [operationKeyIndex],
    }),
    modelOperations: makeTable({
      name: 'modelOperations',
      shape: {
        ...ownedOperationShape,
        committedAt: primitives.date(),
        serviceIndex: primitives.integer(),
      },
      indexes: [{ ...operationKeyIndex, name: 'model_command_operation' }],
    }),
    head: makeTable({
      name: 'head',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        serviceIndex: primitives.integer(),
        executedIndex: primitives.integer(),
        dispositionHash: primitives.text(),
      },
    }),

    executedCommandOutbox: makeTable({
      name: 'executedCommandOutbox',
      shape: {
        ...forwardedCommandShape,
        executedIndex: primitives.integer({ primaryKey: true }),
        serviceIndex: primitives.integer({ unique: true }),
        lastDeliveryFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
    commands: makeTable({
      name: 'commands',
      shape: {
        id: primitives.text(),
        commandName: primitives.text(),
        caller: primitives.json({
          schema: ServiceCallerSchema,
          nullable: true,
        }),
        payload: primitives.text(),
        asyncInput: primitives.json({
          schema: AsyncCommandInputSchema,
          nullable: true,
        }),
        contractVersion: primitives.text(),
        serviceName: primitives.text(),
        serviceVersion: primitives.text(),
        admission: primitives.json({ schema: AdmissionResultSchema }),
        execution: primitives.json({ schema: ExecutionResultSchema }),
        dispositionHash: primitives.text(),
        serviceIndex: primitives.integer({ primaryKey: true }),
        executedIndex: primitives.integer(),
        executionVersion: primitives.text(),
      },
    }),
  } satisfies IAnyTables,
});
