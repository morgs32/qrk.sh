/*
 * System-worker annotation:
 * Collects shared type declarations for system-worker.
 * Keep these shapes limited to multi-consumer contracts; one-consumer shapes belong beside their owning implementation.
 */

import type {
  IAccountCommand,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAccountCommand,
  IExecutedPushedCommand,
  IExecutedServiceCommand,
  IFailedAccountCommand,
  IFailedPushedCommand,
  IFailedServiceCommand,
} from '@zerospin/core/contracts/types';
import type {
  IDb,
  IResourceDrizzleSchemasFromModels,
} from '@zerospin/core/drizzle/types';
import type {
  IAccountCursor,
  IActorId,
  IEncodedResourceShape,
  IModels,
  InferIdFromAbbreviation,
  IServiceCursorId,
} from '@zerospin/core/models/types';
import type {
  IFrontendBlock,
  IFrontendDelta,
  ISessionId,
} from '@zerospin/core/session/types';
import type { IRefRecord } from '@zerospin/core/system/types';
import type { IAnyError } from '@zerospin/error';

type IWorkerRepoDb = IDb;

export type { IWorkerRepoDb };

export type IFrontendBindingRepoSchema =
  IResourceDrizzleSchemasFromModels<IModels>;

export type IFrontendBindingRepoDb = IWorkerRepoDb;

export type IActorControllerRepoSchema =
  IResourceDrizzleSchemasFromModels<IModels>;

export type IActorControllerRepoDb = IWorkerRepoDb;

export type ISystemRepoDb = IWorkerRepoDb;

export type IAuthorizedActorFrontend = {
  accountId: string;
  actorId: string;
  actorName: string;
  frontendName: string;
};

/**
 * A resource paired with the `accountCursor` that caused its latest upsert.
 *
 * Resource rows no longer carry cursor metadata; the cursor travels alongside
 * the resource across repo boundaries so each replica can apply or publish the
 * change with the cursor that actually caused it.
 */
export type IFinalizedResourceRef = {
  accountCursor: IAccountCursor;
  resource: IEncodedResourceShape;
};

export type IAccountRepoSchema = IResourceDrizzleSchemasFromModels<IModels>;

export type IAccountRepoDb = IWorkerRepoDb;

type IPushedBatchCursorId = InferIdFromAbbreviation<'pbcur'>;

type IPushedCommandIssuer =
  | {
      repoKind: 'frontend';
      sessionId: ISessionId;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
    }
  | {
      repoKind: 'frontendBinding';
      actorId: IActorId;
      actorName: string;
      frontendName: string;
    }
  | {
      repoKind: 'actor';
      actorId: IActorId;
      actorName: string;
    }
  | {
      repoKind: 'account';
    };

/** API transport envelope for AccountRepo finalization; not authoritative account truth. */
export type IPushedBatch = Readonly<{
  issuer: IPushedCommandIssuer;
  pushedBatchCursor: IPushedBatchCursorId;
  prevPushedBatchCursor: IPushedBatchCursorId | null;
  commands: readonly IAccountCommand[];
}>;

export type IRefGraph = Record<
  string,
  Readonly<{
    modelName: string;
  }>
>;

export type IAccountBlock = Readonly<{
  pushedBlockId: InferIdFromAbbreviation<'pblk'> | null;
  executedCommands: readonly (
    | IEncodedCommand<IExecutedAccountCommand>
    | IEncodedCommand<IExecutedPushedCommand>
  )[];
  failedCommands: readonly (
    | IEncodedCommand<IFailedAccountCommand>
    | IEncodedCommand<IFailedPushedCommand>
  )[];
  appliedMutations: readonly IEncodedAppliedMutation[];
  lastAccountCursor: IAccountCursor;
  accountIndex: number;
}>;

export type IAccountBlockOutboxRecord = IAccountBlock &
  Readonly<{
    failure: IAnyError | null;
    publishedAt: Date | null;
  }>;

export type IServiceBlock = Readonly<{
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

export type IActorDelta = Readonly<{
  inserted: Readonly<Record<string, IEncodedResourceShape>>;
  deleted: IRefRecord;
}>;

export type IActorBlock = IAccountBlock &
  Readonly<{
    deltas: Readonly<Record<string, IActorDelta>>;
  }>;

export type IActorBlockOutboxRecord = IActorBlock &
  Readonly<{
    failure: IAnyError | null;
  }>;

export type IFrontendBlockOutboxRecord = IFrontendBlock &
  Readonly<{
    failure: IAnyError | null;
  }>;

export type { IFrontendBlock, IFrontendDelta };
