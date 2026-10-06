import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/shapes';
import { Schema } from 'effect';

import {
  asyncOperationShape,
  operationKeyIndex,
} from '../asyncOperations/asyncOperationsDbConfig.js';
import { ownedOperationShape } from '../ownedOperations.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const aggregateChainDbConfig = makeDbConfig({
  tables: {
    results: makeTable({
      name: 'results',
      shape: {
        aggregateIndex: primitives.integer({ primaryKey: true }),
        executedIndex: primitives.integer(),
        executionVersion: primitives.text(),
        execution: primitives.json({ schema: ExecutionResultSchema }),
        dispositionHash: primitives.text(),
      },
    }),
    asyncOperations: makeTable({
      name: 'asyncOperations',
      shape: {
        ...asyncOperationShape,
        aggregateIndex: primitives.integer(),
      },
      indexes: [operationKeyIndex],
    }),
    modelOperations: makeTable({
      name: 'modelOperations',
      shape: {
        aggregateIndex: primitives.integer(),
        ...ownedOperationShape,
        committedAt: primitives.date(),
      },
      indexes: [{ ...operationKeyIndex, name: 'model_command_operation' }],
    }),
    commands: makeTable({
      name: 'commands',
      shape: {
        id: primitives.text({ unique: true }),
        commandName: primitives.text(),
        payload: primitives.text(),
        response: primitives.json({
          schema: Schema.Json,
          nullable: true,
        }),
        contractVersion: primitives.text(),
        aggregateId: primitives.text(),
        aggregateName: primitives.text(),
        systemName: primitives.text(),
        aggregateVersion: primitives.text({ nullable: true }),
        originalExecutionVersion: primitives.text(),
        nodeId: primitives.text({ nullable: true }),
        actorName: primitives.text(),
        actorVersion: primitives.text(),
        claims: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
        }),
        sessionName: primitives.text({ nullable: true }),
        nodeIndex: primitives.integer({ nullable: true }),
        aggregateIndex: primitives.integer({ primaryKey: true }),
        admission: primitives.json({ schema: AdmissionResultSchema }),
      },
      indexes: [
        {
          name: 'commands_node',
          columns: ['nodeId', 'nodeIndex'],
          unique: true,
        },
      ],
    }),
    aggregateVersionRepos: makeTable({
      name: 'aggregateVersionRepos',
      shape: {
        aggregateVersionRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.aggregateVersionRepo,
        }),
        aggregateVersion: primitives.text({ unique: true }),
        active: primitives.boolean(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
  },
});
