import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { AsyncCommandInputSchema } from '@zerospin/core/contracts/AsyncCommandInputSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Schema } from 'effect';

import {
  asyncOperationsDbConfig,
  operationKeyIndex,
} from '../asyncOperations/asyncOperationsDbConfig.js';
import { ownedOperationShape } from '../ownedOperations.js';

const executedAggregateCommandTable = makeTable({
  name: 'executedCommandOutbox',
  shape: {
    id: primitives.text(),
    commandName: primitives.text(),
    payload: primitives.text(),
    asyncInput: primitives.json({
      schema: AsyncCommandInputSchema,
      nullable: true,
    }),
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
    originalExecutionVersion: primitives.text(),
    lastDeliveryFailure: primitives.json({
      schema: PublicFailureSchema,
      nullable: true,
    }),
  },
});

export const aggregateVersionRepoDbConfig = makeDbConfig({
  tables: {
    ...asyncOperationsDbConfig.tables,
    asyncOperations: makeTable({
      name: 'asyncOperations',
      shape: {
        ...asyncOperationsDbConfig.tables.asyncOperations.shape,
        systemName: primitives.text({ nullable: true }),
        executedIndex: primitives.integer(),
      },
      indexes: [operationKeyIndex],
    }),
    modelOperations: makeTable({
      name: 'modelOperations',
      shape: {
        ...ownedOperationShape,
        committedAt: primitives.date(),

        executedIndex: primitives.integer(),
      },
      indexes: [{ ...operationKeyIndex, name: 'model_command_operation' }],
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
    executedCommandOutbox: executedAggregateCommandTable,
    executedAggregateCommandOutbox: makeTable({
      name: 'executedAggregateCommandOutbox',
      shape: executedAggregateCommandTable.shape,
    }),
  } satisfies IAnyTables,
});
