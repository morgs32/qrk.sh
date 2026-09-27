import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

import { AdmissionResultSchema } from '../contracts/AdmissionResultSchema.ts';
import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import { ExecutionSummarySchema } from '../contracts/ExecutionSummarySchema.ts';
import { makeDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';

import { ActorDeltaSchema } from './AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import { StagingResultSchema } from './StagingResultSchema.ts';

export const sessionRepoDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'cmd' }),
        commandName: primitives.text(),
        payload: primitives.text(),
        contractVersion: primitives.text(),
        aggregateId: primitives.text(),
        aggregateName: primitives.text(),
        actorName: primitives.text(),
        actorVersion: primitives.text(),
        sessionName: primitives.text(),
        identity: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
        }),
        sessionId: primitives.foreignKey({ abbreviation: 'sesn' }),
        sessionIndex: primitives.integer(),
        pushIndex: primitives.integer({ nullable: true }),
        staging: primitives.json({ schema: StagingResultSchema }),
        admission: primitives.json({ schema: AdmissionResultSchema }),
        execution: primitives.json({ schema: ExecutionSummarySchema }),
        actorDelta: primitives.json({
          schema: ActorDeltaSchema,
          nullable: true,
        }),
        aggregateIndex: primitives.integer({ nullable: true }),
        executedIndex: primitives.integer({ nullable: true }),
        executedHash: primitives.text({ nullable: true }),
      },
      indexes: [
        {
          name: 'session_command_journal_session_index_unique',
          columns: ['sessionId', 'sessionIndex'],
          unique: true,
        },
      ],
    }),

    optimisticAppliedMutations: makeTable({
      name: 'optimisticAppliedMutations',
      shape: {
        commandId: primitives.primaryKey({ abbreviation: 'cmd' }),
        mutations: primitives.json({
          schema: Schema.Array(EncodedAppliedMutationSchema),
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
        aggregateIndex: primitives.integer(),
        executedIndex: primitives.integer(),
        executedHash: primitives.text(),
        pushIndex: primitives.integer(),
      },
    }),
  },
});
