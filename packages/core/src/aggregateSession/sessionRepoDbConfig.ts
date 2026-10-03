import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

import { EncodedAppliedOperationSchema } from '../contracts/encodeAppliedOperation.ts';
import { makeDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';

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
        claims: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
        }),
        sessionId: primitives.foreignKey({ abbreviation: 'sesn' }),
        sessionIndex: primitives.integer(),
        pushIndex: primitives.integer({ nullable: true }),
        staging: primitives.json({ schema: StagingResultSchema }),
        failure: primitives.json({
          schema: PublicFailureSchema,
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
      indexes: [
        {
          name: 'session_command_journal_session_index_unique',
          columns: ['sessionId', 'sessionIndex'],
          unique: true,
        },
      ],
    }),

    optimisticAppliedOperations: makeTable({
      name: 'optimisticAppliedOperations',
      shape: {
        commandId: primitives.primaryKey({ abbreviation: 'cmd' }),
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
        aggregateIndex: primitives.integer(),
        executedIndex: primitives.integer(),
        executedHash: primitives.text(),
        pushIndex: primitives.integer(),
      },
    }),
  },
});
