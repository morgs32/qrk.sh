import { Schema } from 'effect';

import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import { makeDrizzleSchema } from '../models/primitiveMaps.ts';
import { primitives } from '../models/primitives.ts';
import type { IShape } from '../models/types.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

export const sessionStagedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  contractVersion: primitives.text(),
  commandType: primitives.enum({
    values: ['frontend'],
  }),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  frontendName: primitives.text(),
  userId: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  status: primitives.enum({
    values: ['staged'],
  }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
  stagedAt: primitives.date(),
  replicaIndex: primitives.integer({ nullable: true }),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
    nullable: true,
  }),
} as const;

export const sessionPushedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  contractVersion: primitives.text(),
  commandType: primitives.enum({
    values: ['frontend'],
  }),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  frontendName: primitives.text(),
  userId: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
  stagedAt: primitives.date(),
  replicaIndex: primitives.integer(),
  status: primitives.enum({
    values: ['pushed'],
  }),
  pushedAt: primitives.date(),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
  }),
} as const;

export const sessionExecutedPushedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  contractVersion: primitives.text(),
  commandType: primitives.enum({
    values: ['frontend'],
  }),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  frontendName: primitives.text(),
  userId: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
  stagedAt: primitives.date(),
  replicaIndex: primitives.integer(),
  pushedAt: primitives.date(),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
  }),
  mode: primitives.enum({
    values: ['authoritative', 'optimistic-lww'],
  }),
  aggregateCursor: primitives.cursor({
    abbreviation: coreAbbreviations.aggregateCursor,
  }),
  aggregateIndex: primitives.integer(),
  executedAt: primitives.date(),
  status: primitives.enum({
    values: ['executed'],
  }),
} as const;

export const sessionFailedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  contractVersion: primitives.text(),
  commandType: primitives.enum({
    values: ['frontend'],
  }),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  frontendName: primitives.text(),
  userId: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
  stagedAt: primitives.date(),
  replicaIndex: primitives.integer({ nullable: true }),
  pushedAt: primitives.date({ nullable: true }),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
    nullable: true,
  }),
  aggregateCursor: primitives.cursor({
    abbreviation: coreAbbreviations.aggregateCursor,
    nullable: true,
  }),
  aggregateIndex: primitives.integer({ nullable: true }),
  status: primitives.enum({
    values: ['failed'],
  }),
  failedAt: primitives.date(),
  failure: primitives.text(),
} as const;

export const sessionOptimisticAppliedMutationShape = {
  commandId: primitives.primaryKey({ abbreviation: 'cmd' }),
  mutations: primitives.json({
    schema: Schema.Array(EncodedAppliedMutationSchema),
  }),
} satisfies IShape;

export const sessionStagedCommandDrizzleSchema = makeDrizzleSchema(
  'stagedCommands',
  sessionStagedCommandShape,
);

export const sessionPushedCommandDrizzleSchema = makeDrizzleSchema(
  'pushedCommands',
  sessionPushedCommandShape,
);

export const sessionExecutedPushedCommandDrizzleSchema = makeDrizzleSchema(
  'executedPushedCommands',
  sessionExecutedPushedCommandShape,
);

export const sessionFailedCommandDrizzleSchema = makeDrizzleSchema(
  'failedCommands',
  sessionFailedCommandShape,
);

export const sessionOptimisticAppliedMutationDrizzleSchema = makeDrizzleSchema(
  'optimisticAppliedMutations',
  sessionOptimisticAppliedMutationShape,
);

export type ISessionCommandStatus = 'staged' | 'pushed' | 'executed' | 'failed';

/** Column keys for devtools session command tables (union of lifecycle shapes). */
export const sessionCommandDevtoolsShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  status: primitives.text(),
  payload: primitives.text(),
  failure: primitives.text(),
  stagedAt: primitives.date(),
  pushedAt: primitives.date(),
  executedAt: primitives.date(),
  userId: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
} satisfies IShape;
