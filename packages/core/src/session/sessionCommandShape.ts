import { makeDrizzleSchema, primitives, type IShape } from '@zerospin/schema';
import { Schema } from 'effect';

import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';

import { AggregateFrontendJournalCommandSchema } from './AggregateFrontendCommandSchema.ts';

export const sessionCommandJournalShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  contractVersion: primitives.text(),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  frontendName: primitives.text(),
  userId: primitives.text(),
  sessionId: primitives.foreignKey({ abbreviation: 'sesn' }),
  sessionIndex: primitives.integer({ nullable: true }),
  pushIndex: primitives.integer({ nullable: true }),
  command: primitives.json({
    schema: AggregateFrontendJournalCommandSchema,
  }),
};

export const sessionOptimisticAppliedMutationShape = {
  commandId: primitives.primaryKey({ abbreviation: 'cmd' }),
  mutations: primitives.json({
    schema: Schema.Array(EncodedAppliedMutationSchema),
  }),
} satisfies IShape;

export const sessionCommandJournalDrizzleSchema = makeDrizzleSchema(
  'commandJournal',
  sessionCommandJournalShape,
);

export const sessionOptimisticAppliedMutationDrizzleSchema = makeDrizzleSchema(
  'optimisticAppliedMutations',
  sessionOptimisticAppliedMutationShape,
);

export const sessionCommandDevtoolsShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  userId: primitives.text(),
  sessionId: primitives.foreignKey({ abbreviation: 'sesn' }),
  sessionIndex: primitives.integer(),
  pushIndex: primitives.integer(),
  command: primitives.text(),
} satisfies IShape;
