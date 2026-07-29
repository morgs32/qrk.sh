/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */

import { Schema } from 'effect';

import {
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
  FailedStagedCommandSchema,
  PushedCommandSchema,
  StagedCommandSchema,
} from '../contracts/CommandSchema.ts';
import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type {
  IFrontendBlock,
  IFrontendDelta,
  IFrontendGenerationBoundaryBlock,
  IFrontendLineageBlock,
  IFrontendLineageTransitionRequired,
  IFrontendReplicaBlock,
  IFrontendReplicaState,
  IFrontendSyncState,
} from './types.ts';

export const FrontendDeltaSchema: Schema.Schema<IFrontendDelta, any> =
  Schema.Struct({
    inserted: Schema.Array(EncodedResourceSchema),
    updated: Schema.Array(EncodedResourceSchema),
    deleted: Schema.Array(RefSchema),
  });

export const FrontendBlockSchema = Schema.Struct({
  frontendName: Schema.String,
  lastAccountCursor: makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
  frontendIndex: Schema.Number,
  lastRebasedPushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
  delta: FrontendDeltaSchema,
  pendingPushedCommands: Schema.Array(PushedCommandSchema),
  executedPushedCommands: Schema.Array(ExecutedPushedCommandSchema),
  failedPushedCommands: Schema.Array(FailedPushedCommandSchema),
}) satisfies Schema.Schema<IFrontendBlock, any>;

export const FrontendSyncStateSchema = Schema.Struct({
  accountId: makeAbbreviationIdSchema(coreAbbreviations.account),
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  systemVersion: Schema.String,
  systemWorkerName: Schema.String,
  accountName: Schema.String,
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendIndex: Schema.Number,
  lastRebasedPushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
  pushedCommands: Schema.Array(PushedCommandSchema),
  resources: Schema.Array(EncodedResourceSchema),
  executedPushedCommands: Schema.Array(ExecutedPushedCommandSchema),
  failedPushedCommands: Schema.Array(FailedPushedCommandSchema),
}) satisfies Schema.Schema<IFrontendSyncState, any>;

const OptimisticAppliedMutationsSchema = Schema.Struct({
  commandId: makeAbbreviationIdSchema(coreAbbreviations.command),
  mutations: Schema.Array(EncodedAppliedMutationSchema),
});

export const FrontendReplicaStateSchema = Schema.extend(
  FrontendSyncStateSchema,
  Schema.Struct({
    frontendVersion: Schema.String,
    replicaIndex: Schema.Number,
    stagedCommands: Schema.Array(StagedCommandSchema),
    failedStagedCommands: Schema.Array(FailedStagedCommandSchema),
    optimisticAppliedMutations: Schema.Array(OptimisticAppliedMutationsSchema),
  }),
) satisfies Schema.Schema<IFrontendReplicaState, any>;

export const FrontendGenerationBoundaryBlockSchema = Schema.Struct({
  kind: Schema.Literal('generation-boundary'),
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  prevGenerationId: Schema.String,
  generationId: Schema.String,
  accountId: makeAbbreviationIdSchema(coreAbbreviations.account),
  accountName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendIndex: Schema.Number,
}) satisfies Schema.Schema<IFrontendGenerationBoundaryBlock, any>;

const FrontendResourceLineageBlockSchema = Schema.Struct({
  kind: Schema.Literal('frontend'),
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  accountId: makeAbbreviationIdSchema(coreAbbreviations.account),
  accountName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendBlock: FrontendBlockSchema,
});

export const FrontendLineageBlockSchema = Schema.Union(
  FrontendGenerationBoundaryBlockSchema,
  FrontendResourceLineageBlockSchema,
) satisfies Schema.Schema<IFrontendLineageBlock, any>;

const FrontendReplicaTargetSchema = {
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  accountId: makeAbbreviationIdSchema(coreAbbreviations.account),
  accountName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendVersion: Schema.String,
  replicaIndex: Schema.Number,
  frontendIndex: Schema.Number,
};

const FrontendServerReplicaBlockSchema = Schema.Struct({
  kind: Schema.Literal('server'),
  ...FrontendReplicaTargetSchema,
  lineageBlock: FrontendLineageBlockSchema,
});

const FrontendLocalCommandReplicaBlockSchema = Schema.Struct({
  kind: Schema.Literal('local-command'),
  ...FrontendReplicaTargetSchema,
  delta: FrontendDeltaSchema,
  stagedCommandsAdded: Schema.Array(StagedCommandSchema),
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
  failedStagedCommandsAdded: Schema.Array(FailedStagedCommandSchema),
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

export const FrontendReplicaBlockSchema = Schema.Union(
  FrontendServerReplicaBlockSchema,
  FrontendLocalCommandReplicaBlockSchema,
) satisfies Schema.Schema<IFrontendReplicaBlock, any>;

export const FrontendLineageTransitionRequiredSchema = Schema.Struct({
  kind: Schema.Literal('lineage-transition-required'),
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  accountId: makeAbbreviationIdSchema(coreAbbreviations.account),
  accountName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendVersion: Schema.String,
  appliedBoundaryIndex: Schema.Number,
  remainingBoundaries: Schema.Array(FrontendGenerationBoundaryBlockSchema),
}) satisfies Schema.Schema<IFrontendLineageTransitionRequired, any>;
