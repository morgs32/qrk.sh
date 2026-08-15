/*
 * System-worker annotation:
 * Defines AggregateBlockRepo durable table shapes and Drizzle schemas.
 */

import {
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IEncodedAppliedMutation } from '@zerospin/core/contracts/types';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAnyTables,
  InferDecodedRow,
  IShape,
} from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type { IAggregateBlock } from '../types.js';

const executedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  contractVersion: primitives.text(),
  commandType: primitives.enum({
    values: ['aggregate', 'frontend'],
  }),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
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
  sessionId: primitives.opaqueId({ abbreviation: 'sesn', nullable: true }),
  userId: primitives.text({ nullable: true }),
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
  replicaIndex: primitives.integer({ nullable: true }),
} satisfies IShape;

const failedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  systemName: primitives.text(),
  contractVersion: primitives.text(),
  commandType: primitives.enum({
    values: ['aggregate', 'frontend'],
  }),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  aggregateCursor: primitives.cursor({
    abbreviation: coreAbbreviations.aggregateCursor,
  }),
  aggregateIndex: primitives.integer(),
  failedAt: primitives.date(),
  failure: primitives.text(),
  status: primitives.enum({
    values: ['failed'],
  }),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn', nullable: true }),
  userId: primitives.text({ nullable: true }),
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
  replicaIndex: primitives.integer({ nullable: true }),
} satisfies IShape;

const mutationShape = Object.freeze({
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
} satisfies IShape);

assert<
  Equals<InferDecodedRow<typeof mutationShape>, IEncodedAppliedMutation>
>();

const finalizedBlockShape = Object.freeze({
  writeIndex: primitives.integer(),
  lastAggregateCursor: primitives.primaryKey({
    abbreviation: coreAbbreviations.aggregateCursor,
  }),
  aggregateIndex: primitives.integer({ unique: true }),
  executedCommands: primitives.json({
    schema: Schema.Array(
      Schema.Union(
        EncodedExecutedAggregateCommandSchema,
        ExecutedPushedCommandSchema,
      ),
    ),
  }),
  failedCommands: primitives.json({
    schema: Schema.Array(
      Schema.Union(
        EncodedFailedAggregateCommandSchema,
        FinalizedFailedStagedReplicaCommandSchema,
        FailedPushedCommandSchema,
      ),
    ),
  }),
  appliedMutations: primitives.json({
    schema: Schema.Array(EncodedAppliedMutationSchema),
  }),
} satisfies IShape);

assert<Equals<InferDecodedRow<typeof finalizedBlockShape>, IAggregateBlock>>();

export const aggregateBlockTables = {
  finalizedBlocks: makeTable({
    name: 'finalizedBlocks',
    shape: finalizedBlockShape,
    indexes: [
      {
        name: 'finalizedBlocks_aggregateIndex_unique',
        columns: ['aggregateIndex'],
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
  aggregateFrontendSubscribers: makeTable({
    name: 'aggregateFrontendSubscribers',
    shape: {
      aggregateFrontendRepoName: primitives.primaryKey({
        abbreviation: systemWorkerAbbreviations.aggregateFrontendRepo,
      }),
      aggregateId: primitives.text(),
      aggregateName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      currentAggregateCursor: primitives.cursor({
        abbreviation: coreAbbreviations.aggregateCursor,
        nullable: true,
      }),
      currentAggregateIndex: primitives.integer({ nullable: true }),
      queuedAggregateCursor: primitives.cursor({
        abbreviation: coreAbbreviations.aggregateCursor,
        nullable: true,
      }),
      queuedAggregateIndex: primitives.integer({ nullable: true }),
      lastDeliveryError: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

export const aggregateBlockDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(aggregateBlockTables);
