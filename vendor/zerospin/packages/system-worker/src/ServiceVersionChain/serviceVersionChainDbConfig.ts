import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { ServiceCallerSchema } from '@zerospin/core/contracts/ServiceCallerSchema';
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
export const serviceVersionChainDbConfig = makeDbConfig({
  tables: {
    asyncOperations: makeTable({
      name: 'asyncOperations',
      shape: {
        ...asyncOperationShape,
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
        response: primitives.json({
          schema: Schema.Json,
          nullable: true,
        }),
        contractVersion: primitives.text(),
        serviceName: primitives.text(),
        serviceVersion: primitives.text(),
        admission: primitives.json({ schema: AdmissionResultSchema }),
        execution: primitives.json({ schema: ExecutionResultSchema }),
        dispositionHash: primitives.text(),
        serviceIndex: primitives.integer({ primaryKey: true }),
        executedIndex: primitives.integer({ unique: true }),
        executionVersion: primitives.text(),
      },
    }),
    executionResultsFanoutSubscribers: makeTable({
      name: 'executionResultsFanoutSubscribers',
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
  },
});
