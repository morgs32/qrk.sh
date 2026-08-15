/*
 * System-worker annotation:
 * Collects shared type declarations for system-worker.
 * Keep these shapes limited to multi-consumer contracts; one-consumer shapes belong beside their owning implementation.
 */

import type {
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAggregateCommand,
  IExecutedPushedCommand,
  IExecutedServiceCommand,
  IFailedAggregateCommand,
  IFinalizedFailedStagedReplicaCommand,
  IFailedPushedCommand,
  IFailedServiceCommand,
} from '@zerospin/core/contracts/types';
import type { IResourceDrizzleSchemasFromModels } from '@zerospin/core/drizzle/types';
import type {
  IAggregateCursor,
  IEncodedResourceShape,
  IModels,
  IServiceCursorId,
} from '@zerospin/core/models/types';
import type {
  IAggregateFrontendBlock,
  IFrontendDelta,
} from '@zerospin/core/session/types';
import type { IAnyError } from '@zerospin/error';

/**
 * A resource paired with the `aggregateCursor` that caused its latest upsert.
 *
 * Resource rows no longer carry cursor metadata; the cursor travels alongside
 * the resource across repo boundaries so each replica can apply or publish the
 * change with the cursor that actually caused it.
 */
export type IFinalizedResourceRef = {
  aggregateCursor: IAggregateCursor;
  resource: IEncodedResourceShape;
};

export type IAggregateRepoSchema = IResourceDrizzleSchemasFromModels<IModels>;

export type IAggregateBlock = Readonly<{
  writeIndex: number;
  executedCommands: readonly (
    | IEncodedCommand<IExecutedAggregateCommand>
    | IEncodedCommand<IExecutedPushedCommand>
  )[];
  failedCommands: readonly (
    | IEncodedCommand<IFailedAggregateCommand>
    | IEncodedCommand<IFinalizedFailedStagedReplicaCommand>
    | IEncodedCommand<IFailedPushedCommand>
  )[];
  appliedMutations: readonly IEncodedAppliedMutation[];
  lastAggregateCursor: IAggregateCursor;
  aggregateIndex: number;
}>;

export type IAggregateBlockOutboxRecord = IAggregateBlock &
  Readonly<{
    failure: IAnyError | null;
    publishedAt: Date | null;
  }>;

export type IServiceBlock = Readonly<{
  writeIndex: number;
  executedCommands: readonly IEncodedCommand<IExecutedServiceCommand>[];
  failedCommands: readonly IEncodedCommand<IFailedServiceCommand>[];
  appliedMutations: readonly IEncodedAppliedMutation[];
  lastServiceCursor: IServiceCursorId;
  serviceIndex: number;
}>;

export type IServiceBlockOutboxRecord = IServiceBlock &
  Readonly<{
    failure: IAnyError | null;
  }>;

export type IAggregateFrontendBlockOutboxRecord = IAggregateFrontendBlock &
  Readonly<{
    failure: IAnyError | null;
  }>;

export type { IAggregateFrontendBlock, IFrontendDelta };
