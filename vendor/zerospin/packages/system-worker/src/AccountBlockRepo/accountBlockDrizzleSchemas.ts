/*
 * System-worker annotation:
 * Defines AccountBlockRepo durable table shapes and Drizzle schemas.
 */

import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IEncodedAppliedMutation } from '@zerospin/core/contracts/types';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables, InferDecodedRow } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type { IAccountBlock } from '../types.js';

const executedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  version: primitives.text(),
  commandType: primitives.enum({
    values: ['account', 'frontend'],
  }),
  accountId: primitives.text(),
  accountName: primitives.text(),
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
  sessionId: primitives.opaqueId({ abbreviation: 'sesn', nullable: true }),
  actorId: primitives.text({ nullable: true }),
  actorName: primitives.text({ nullable: true }),
  frontendName: primitives.text({ nullable: true }),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
    nullable: true,
  }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
    nullable: true,
  }),
  stagedAt: primitives.date({ nullable: true }),
  pushedAt: primitives.date({ nullable: true }),
} as const;

const failedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  version: primitives.text(),
  commandType: primitives.enum({
    values: ['account', 'frontend'],
  }),
  accountId: primitives.text(),
  accountName: primitives.text(),
  accountCursor: primitives.cursor({
    abbreviation: coreAbbreviations.accountCursor,
  }),
  accountIndex: primitives.integer(),
  failedAt: primitives.date(),
  failure: primitives.text(),
  status: primitives.enum({
    values: ['failed'],
  }),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn', nullable: true }),
  actorId: primitives.text({ nullable: true }),
  actorName: primitives.text({ nullable: true }),
  frontendName: primitives.text({ nullable: true }),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
    nullable: true,
  }),
  stagedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.stagedCursor,
    nullable: true,
  }),
  stagedAt: primitives.date({ nullable: true }),
  pushedAt: primitives.date({ nullable: true }),
} as const;

const mutationShape = {
  commandId: primitives.text(),
  mutationIndex: primitives.integer(),
  resourceId: primitives.text(),
  modelName: primitives.text(),
  modelVersion: primitives.text(),
  appliedAt: primitives.date(),
  lastAppliedAt: primitives.date({ nullable: true }),
  operationName: primitives.enum({
    values: ['create', 'delete', 'move', 'replicateResource', 'update'],
  }),
  operation: primitives.text(),
  inverseOperation: primitives.text(),
} as const;

assert<
  Equals<InferDecodedRow<typeof mutationShape>, IEncodedAppliedMutation>
>();

const finalizedBlockShape = {
  pushedBlockId: primitives.opaqueId({ abbreviation: 'pblk', nullable: true }),
  lastAccountCursor: primitives.primaryKey({
    abbreviation: coreAbbreviations.accountCursor,
  }),
  accountIndex: primitives.integer({ unique: true }),
  executedCommands: primitives.json({
    schema: Schema.Array(
      Schema.Union(
        EncodedExecutedAccountCommandSchema,
        ExecutedPushedCommandSchema,
      ),
    ),
  }),
  failedCommands: primitives.json({
    schema: Schema.Array(
      Schema.Union(
        EncodedFailedAccountCommandSchema,
        FailedPushedCommandSchema,
      ),
    ),
  }),
  appliedMutations: primitives.json({
    schema: Schema.Array(EncodedAppliedMutationSchema),
  }),
} as const;

assert<Equals<InferDecodedRow<typeof finalizedBlockShape>, IAccountBlock>>();

export const accountBlockTables = {
  finalizedBlocks: makeTable({
    name: 'finalizedBlocks',
    shape: finalizedBlockShape,
    indexes: [
      {
        name: 'finalizedBlocks_accountIndex_unique',
        columns: ['accountIndex'],
        unique: true,
      },
    ],
  }),
  executedCommands: makeTable({
    name: 'executedCommands',
    shape: executedCommandShape,
  }),
  failedCommands: makeTable({
    name: 'failedCommands',
    shape: failedCommandShape,
  }),
  mutations: makeTable({
    name: 'mutations',
    shape: mutationShape,
    indexes: [
      {
        name: 'mutations_command_mutation_idx',
        columns: ['commandId', 'mutationIndex'],
        unique: true,
      },
      {
        name: 'mutations_command_idx',
        columns: ['commandId'],
      },
      {
        name: 'mutations_model_resource_idx',
        columns: ['modelName', 'resourceId'],
      },
    ],
  }),
  actorSubscribers: makeTable({
    name: 'actorSubscribers',
    shape: {
      actorRepoName: primitives.primaryKey({
        abbreviation: coreAbbreviations.actorRepo,
      }),
      accountId: primitives.text(),
      accountName: primitives.text(),
      actorId: primitives.text(),
      actorName: primitives.text(),
      currentAccountCursor: primitives.cursor({
        abbreviation: coreAbbreviations.accountCursor,
        nullable: true,
      }),
      currentAccountIndex: primitives.integer({ nullable: true }),
      queuedAccountCursor: primitives.cursor({
        abbreviation: coreAbbreviations.accountCursor,
        nullable: true,
      }),
      queuedAccountIndex: primitives.integer({ nullable: true }),
      deliveryAttempts: primitives.integer(),
      nextRetryAt: primitives.integer({ nullable: true }),
      lastDeliveryError: primitives.text({ nullable: true }),
      failedAt: primitives.integer({ nullable: true }),
      succeededAt: primitives.integer({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

export const accountBlockDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(accountBlockTables);
