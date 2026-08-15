/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */

import { Schema } from 'effect';

import {
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
  FailedStagedReplicaCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  PushedCommandSchema,
  StagedReplicaCommandSchema,
} from '../contracts/CommandSchema.ts';
import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type {
  IAggregateFrontendBlock,
  IAggregateFrontendReplicaBlock,
  IAggregateFrontendReplicaState,
  IAggregateFrontendSyncState,
  IFrontendDelta,
} from './types.ts';

export const FrontendDeltaSchema: Schema.Schema<IFrontendDelta, any> =
  Schema.Struct({
    inserted: Schema.Array(EncodedResourceSchema),
    updated: Schema.Array(EncodedResourceSchema),
    deleted: Schema.Array(RefSchema),
  });

export const AggregateFrontendBlockSchema = Schema.Struct({
  frontendName: Schema.String,
  lastAggregateCursor: makeAbbreviationIdSchema(
    coreAbbreviations.aggregateCursor,
  ),
  frontendIndex: Schema.Number,
  delta: FrontendDeltaSchema,
  pendingPushedCommands: Schema.Array(PushedCommandSchema),
  executedPushedCommands: Schema.Array(ExecutedPushedCommandSchema),
  failedPushedCommands: Schema.Array(FailedPushedCommandSchema),
}) satisfies Schema.Schema<IAggregateFrontendBlock, any>;

export const AggregateFrontendSyncStateSchema = Schema.Struct({
  aggregateId: makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  userId: Schema.NonEmptyString,
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  systemVersion: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  frontendIndex: Schema.Number,
  pushedCommands: Schema.Array(PushedCommandSchema),
  resources: Schema.Array(EncodedResourceSchema),
  executedPushedCommands: Schema.Array(ExecutedPushedCommandSchema),
  failedPushedCommands: Schema.Array(FailedPushedCommandSchema),
}) satisfies Schema.Schema<IAggregateFrontendSyncState, any>;

const OptimisticAppliedMutationsSchema = Schema.Struct({
  commandId: makeAbbreviationIdSchema(coreAbbreviations.command),
  mutations: Schema.Array(EncodedAppliedMutationSchema),
});

export const AggregateFrontendReplicaStateSchema = Schema.extend(
  AggregateFrontendSyncStateSchema,
  Schema.Struct({
    aggregateFrontendLockKey: Schema.String,
    replicaIndex: Schema.Number,
    stagedCommands: Schema.Array(StagedReplicaCommandSchema),
    failedStagedCommands: Schema.Array(
      Schema.Union(
        FinalizedFailedStagedReplicaCommandSchema,
        FailedStagedReplicaCommandSchema,
      ),
    ),
    optimisticAppliedMutations: Schema.Array(OptimisticAppliedMutationsSchema),
  }),
) satisfies Schema.Schema<IAggregateFrontendReplicaState, any>;

const AggregateFrontendReplicaTargetSchema = {
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  aggregateId: makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  aggregateName: Schema.String,
  userId: Schema.NonEmptyString,
  frontendName: Schema.String,
  aggregateFrontendLockKey: Schema.String,
  replicaIndex: Schema.Number,
  frontendIndex: Schema.Number,
};

const AggregateFrontendServerReplicaBlockSchema = Schema.Struct({
  kind: Schema.Literal('server'),
  ...AggregateFrontendReplicaTargetSchema,
  frontendBlock: AggregateFrontendBlockSchema,
});

const AggregateFrontendLocalCommandReplicaBlockSchema = Schema.Struct({
  kind: Schema.Literal('local-command'),
  ...AggregateFrontendReplicaTargetSchema,
  delta: FrontendDeltaSchema,
  stagedCommandsAdded: Schema.Array(StagedReplicaCommandSchema),
  stagedCommandIdsRemoved: Schema.Array(
    makeAbbreviationIdSchema(coreAbbreviations.command),
  ),
  pushedCommandsAdded: Schema.Array(PushedCommandSchema),
  pushedCommandIdsRemoved: Schema.Array(
    makeAbbreviationIdSchema(coreAbbreviations.command),
  ),
  executedPushedCommandsAdded: Schema.Array(ExecutedPushedCommandSchema),
  executedPushedCommandIdsRemoved: Schema.Array(
    makeAbbreviationIdSchema(coreAbbreviations.command),
  ),
  failedStagedCommandsAdded: Schema.Array(
    Schema.Union(
      FinalizedFailedStagedReplicaCommandSchema,
      FailedStagedReplicaCommandSchema,
    ),
  ),
  failedPushedCommandsAdded: Schema.Array(FailedPushedCommandSchema),
  failedCommandIdsRemoved: Schema.Array(
    makeAbbreviationIdSchema(coreAbbreviations.command),
  ),
  optimisticAppliedMutationsAdded: Schema.Array(
    OptimisticAppliedMutationsSchema,
  ),
  optimisticAppliedMutationCommandIdsRemoved: Schema.Array(
    makeAbbreviationIdSchema(coreAbbreviations.command),
  ),
});

export const AggregateFrontendReplicaBlockSchema = Schema.Union(
  AggregateFrontendServerReplicaBlockSchema,
  AggregateFrontendLocalCommandReplicaBlockSchema,
) satisfies Schema.Schema<IAggregateFrontendReplicaBlock, any>;
