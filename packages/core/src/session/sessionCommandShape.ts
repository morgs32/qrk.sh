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
  systemVersion: primitives.text(),
  version: primitives.text(),
  commandType: primitives.enum({
    values: ['frontend'],
  }),
  accountId: primitives.text(),
  accountName: primitives.text(),
  frontendName: primitives.text(),
  actorId: primitives.text(),
  actorName: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  status: primitives.enum({
    values: ['staged'],
  }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
  stagedAt: primitives.date(),
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
  systemVersion: primitives.text(),
  version: primitives.text(),
  commandType: primitives.enum({
    values: ['frontend'],
  }),
  accountId: primitives.text(),
  accountName: primitives.text(),
  frontendName: primitives.text(),
  actorId: primitives.text(),
  actorName: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
  stagedAt: primitives.date(),
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
  systemVersion: primitives.text(),
  version: primitives.text(),
  commandType: primitives.enum({
    values: ['frontend'],
  }),
  accountId: primitives.text(),
  accountName: primitives.text(),
  frontendName: primitives.text(),
  actorId: primitives.text(),
  actorName: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
  stagedAt: primitives.date(),
  pushedAt: primitives.date(),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
  }),
  mode: primitives.enum({
    values: ['authoritative', 'optimistic-lww'],
  }),
  accountCursor: primitives.cursor({
    abbreviation: coreAbbreviations.accountCursor,
  }),
  accountIndex: primitives.integer(),
  executedAt: primitives.date(),
  status: primitives.enum({
    values: ['executed'],
  }),
} as const;

export const sessionFailedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  version: primitives.text(),
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
  actorName: primitives.text(),
  status: primitives.text(),
  payload: primitives.text(),
  failure: primitives.text(),
  stagedAt: primitives.date(),
  pushedAt: primitives.date(),
  executedAt: primitives.date(),
  actorId: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
  }),
} satisfies IShape;
