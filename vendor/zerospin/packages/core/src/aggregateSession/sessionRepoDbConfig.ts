import { makeTable, primitives } from '@zerospin/shapes';
import { Schema } from 'effect';

import { AdmissionResultSchema } from '../contracts/AdmissionResultSchema.ts';
import { EncodedAppliedOperationSchema } from '../contracts/encodeAppliedOperation.ts';
import { ExecutionResultSchema } from '../contracts/ExecutionResultSchema.ts';
import { makeDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';

import { StagingResultSchema } from './StagingResultSchema.ts';

export const sessionRepoDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        sessionIndex: primitives.integer({ primaryKey: true }),
        id: primitives.text(),
        commandName: primitives.text(),
        payload: primitives.text({ nullable: true }),
        contractVersion: primitives.text({ nullable: true }),
        aggregateId: primitives.text({ nullable: true }),
        aggregateName: primitives.text({ nullable: true }),
        actorName: primitives.text({ nullable: true }),
        actorVersion: primitives.text({ nullable: true }),
        sessionName: primitives.text({ nullable: true }),
        claims: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
          nullable: true,
        }),
        sessionId: primitives.text({ nullable: true }),
        nodeId: primitives.text({ nullable: true }),
        nodeIndex: primitives.integer({ nullable: true }),
        admissionIndex: primitives.integer({ nullable: true }),
        staging: primitives.json({
          schema: StagingResultSchema,
          nullable: true,
        }),
        admission: primitives.json({
          schema: AdmissionResultSchema,
          nullable: true,
        }),
        execution: primitives.json({
          schema: ExecutionResultSchema,
          nullable: true,
        }),
        actorDelta: primitives.json({
          schema: ActorDeltaSchema,
          nullable: true,
        }),
        aggregateIndex: primitives.integer({ nullable: true }),
        executedIndex: primitives.integer({ nullable: true }),
        executedHash: primitives.text({ nullable: true }),
      },
    }),

    optimisticAppliedOperations: makeTable({
      name: 'optimisticAppliedOperations',
      shape: {
        sessionIndex: primitives.integer({ primaryKey: true }),
        operations: primitives.json({
          schema: Schema.Array(EncodedAppliedOperationSchema),
        }),
      },
    }),

    sessionMetadata: makeTable({
      name: 'sessionMetadata',
      shape: {
        sessionId: primitives.primaryKey({ abbreviation: 'sesn' }),
        actorName: primitives.text(),
        actorVersion: primitives.text(),
        nextSessionIndex: primitives.integer(),
        changeIndex: primitives.integer(),
        aggregateIndex: primitives.integer(),
        executedIndex: primitives.integer(),
        executedHash: primitives.text(),
        pushIndex: primitives.integer(),
      },
    }),
  },
});
