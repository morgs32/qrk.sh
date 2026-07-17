/*
 * System-worker annotation:
 * Defines the AccountRepo Durable Object shell and local storage wiring.
 * Public RPC/lifecycle methods should delegate to same-named Effect functions instead of growing inline workflow bodies here.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type { IActor } from '@zerospin/core/actorController/types';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IAccountCommand,
  IPushedBlock,
} from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAccountCursor,
  IAnyTables,
  IEncodedResourceShape,
  InferDecodedRow,
  IServiceCursorId,
} from '@zerospin/core/models/types';
import type { IEncodedQuery } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import type { IRpcEitherEncoded } from '@zerospin/core/utils/types';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import {
  makeRpcHandler,
  type IRpcEnvelope,
  type IRpcRequest,
} from '@zerospin/logger';
import { Cause, Effect, Either, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';
import { assert, type Equals } from 'tsafe';

import {
  getLastAccountCursor,
  getLastAccountIndex,
} from '../getLastAccountCursor/getLastAccountCursor.js';
import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import { ServiceRepo } from '../ServiceRepo/ServiceRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';
import type {
  IAccountBlock,
  IAccountBlockOutboxRecord,
  IServiceBlock,
} from '../types.js';

import { alarm } from './alarm/alarm.js';
import { authenticate } from './authenticate/authenticate.js';
import { drainAccountOutboxes } from './drainAccountOutboxes/drainAccountOutboxes.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { dumpAccountModelResources } from './dumpAccountModelResources/dumpAccountModelResources.js';
import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { finalizeAccountBlock } from './finalizeAccountBlock/finalizeAccountBlock.js';
import { finalizePushedCommands } from './finalizePushedCommands/finalizePushedCommands.js';
import { getReplaySubscriptions } from './getReplaySubscriptions/getReplaySubscriptions.js';
import { handleServiceBlocks } from './handleServiceBlocks/handleServiceBlocks.js';
import { restoreReplaySubscription } from './restoreReplaySubscription/restoreReplaySubscription.js';
import { replayAccountBlock } from './replayAccountBlock/replayAccountBlock.js';

interface IAccountRepoRpcTarget {
  dumpAccountModelResources(props: {
    accountName: string;
    modelName: string;
  }): IRpcEitherEncoded<Array<IEncodedResourceShape>>;
  getLastAccountCursor(): IRpcEitherEncoded<IAccountCursor | null | undefined>;
  getLastAccountIndex(): IRpcEitherEncoded<number | null | undefined>;
  executeSelectQuery(props: {
    accountName: string;
    query: IEncodedQuery;
  }): IRpcEitherEncoded<unknown>;
  authenticate(props: {
    accountName: string;
    actorName: string;
    frontendName: string;
    signature: unknown;
  }): IRpcEitherEncoded<IActor>;
  finalizeAccountBlock(
    request: IRpcRequest<
      [
        {
          accountId: string;
          accountName: string;
          commands: readonly IAccountCommand[];
        },
      ]
    >,
  ): Promise<IRpcEnvelope<IAccountBlockOutboxRecord, IAnyErrorJson>>;
  finalizePushedCommands(
    request: IRpcRequest<[{ pushedBlock: IPushedBlock }]>,
  ): Promise<IRpcEnvelope<IAccountBlockOutboxRecord, IAnyErrorJson>>;
  handleServiceBlocks(props: {
    serviceName: string;
    blocks: readonly IServiceBlock[];
  }): IRpcEitherEncoded<void>;
}

const blockOutbox = {
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
  publishedAt: primitives.date({ nullable: true }),
  failure: primitives.json({ schema: ZerospinError.schema, nullable: true }),
} as const;

assert<
  Equals<InferDecodedRow<typeof blockOutbox>, IAccountBlockOutboxRecord>
>();

const accountRepoTables = {
  accountBlockOutbox: makeTable({
    name: 'accountBlockOutbox',
    shape: blockOutbox,
    indexes: [
      {
        name: 'accountBlockOutbox_accountIndex_unique',
        columns: ['accountIndex'],
        unique: true,
      },
      {
        name: 'accountBlockOutbox_pushedBlockId_unique',
        columns: ['pushedBlockId'],
        unique: true,
      },
    ],
  }),
  serviceSubscriptions: makeTable({
    name: 'serviceSubscriptions',
    shape: {
      serviceRepoName: primitives.primaryKey({
        abbreviation: coreAbbreviations.serviceRepo,
      }),
      serviceName: primitives.text(),
      currentServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
      }),
      currentServiceIndex: primitives.integer(),
      subscribedAt: primitives.date({ nullable: true }),
      failure: primitives.json({
        schema: ZerospinError.schema,
        nullable: true,
      }),
    },
  }),
  accountReplayReceipts: makeTable({
    name: 'accountReplayReceipts',
    shape: {
      deployId: primitives.opaqueId({
        abbreviation: cloudIdAbbreviations.deploy,
      }),
      prevGenerationId: primitives.opaqueId({
        abbreviation: cloudIdAbbreviations.generation,
      }),
      sourceAccountIndex: primitives.integer(),
      lastAccountCursor: primitives.cursor({
        abbreviation: coreAbbreviations.accountCursor,
      }),
      appliedMutationCount: primitives.integer(),
      discardedMutationCount: primitives.integer(),
      completedAt: primitives.date(),
    },
    indexes: [
      {
        name: 'accountReplayReceipts_deploy_generation_index_unique',
        columns: ['deployId', 'prevGenerationId', 'sourceAccountIndex'],
        unique: true,
      },
      {
        name: 'accountReplayReceipts_sourceAccountIndex_idx',
        columns: ['sourceAccountIndex'],
      },
    ],
  }),
} satisfies IAnyTables;

export const accountRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(accountRepoTables);

const accountRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.accountRepo,
  repoType: 'AccountRepo',
  namePattern: RoutePattern.parse('/:generationId/:accountId/:accountName'),
  managedRuntime,
  getDbConfig: Effect.fn('AccountRepo.getDbConfig')(function* (props) {
    const { key } = props;

    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: key.accountName,
      recordKind: 'accountControllers',
    });

    return makeResourceDbConfig({
      models: accountController.models,
      otherTables: accountRepoTables,
    });
  }),
  bootstrap: Effect.fn('AccountRepo.bootstrap')(function* (props: {
    ctx: DurableObjectState;
    name: string;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
    };
    db: unknown;
    schema: unknown;
    relations: unknown;
  }) {
    const { key } = props;
    const { accountId } = key;

    /*
     * Register this account id in the SystemRepo for the generation parsed from
     * this AccountRepo's own name. The SystemRepo write is idempotent
     * (`onConflictDoNothing`), so repeat bootstrap runs can re-announce the
     * account without duplicating registry rows; `decodeRpc` keeps any remote
     * failure inside the Effect bootstrap path.
     */
    yield* makeAsync(() =>
      SystemRepo.getRepo({ generationId: key.generationId }).upsertAccount({
        accountId,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
  }),
});

/**
 * Account-repo Durable Object (one per `accountId` + `accountName`, `ACCOUNT_REPO` binding).
 *
 * Owns account model resource state and guard/application execution only.
 * Command intake, finalized block outbox, and authorization live here and in
 * AccountBlockRepo / AuthorizationRepo.
 *
 * Lookup: `getAccountRepo`.
 */
export class AccountRepo
  extends makeRepo({ repoUtils: accountRepoUtils })
  implements IAccountRepoRpcTarget
{
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = accountRepoUtils;

  async dumpAccountModelResources(props: {
    accountName: string;
    modelName: string;
  }): Promise<
    Schema.EitherEncoded<Array<IEncodedResourceShape>, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      dumpAccountModelResources({
        ...props,
        db: this.db,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getLastAccountCursor(): Promise<
    Schema.EitherEncoded<IAccountCursor | null, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      getLastAccountCursor({
        storage: this.ctx.storage,
        defaultValue: null,
      }).pipe(encodeRpc),
    );
  }

  async getLastAccountIndex(): Promise<
    Schema.EitherEncoded<number | null, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      getLastAccountIndex({
        storage: this.ctx.storage,
        defaultValue: null,
      }).pipe(encodeRpc),
    );
  }

  /**
   * Runs a select-only encoded SQL query against this account's SQLite adapter.
   *
   * `SystemApi.executeSelectQuery` → `SystemWorker.executeSelectQuery` → here.
   */
  async executeSelectQuery(props: {
    accountName: string;
    query: IEncodedQuery;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    const { query } = props;
    return managedRuntime.runPromise(
      executeSelectQuery({
        db: this.db,
        query,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  /**
   * Verifies a frontend session signature against authoritative account rows.
   *
   * Missing account rows can be created by the frontend-binding authentication
   * procedure through `finalizeAccountCommands`.
   */
  async authenticate(props: {
    accountName: string;
    actorName: string;
    frontendName: string;
    signature: unknown;
  }): Promise<Schema.EitherEncoded<IActor, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(this, function* () {
        const actor = yield* authenticate({
          ...props,
          generationId: this.key.generationId,
          accountId: this.key.accountId,
          db: this.db,
          storage: this.ctx.storage,
        });
        yield* drainAccountOutboxes({
          accountRepoName: this.ctx.id.name ?? '',
          generationId: this.key.generationId,
          accountId: this.key.accountId,
          accountName: this.key.accountName,
          db: this.db,
          storage: this.ctx.storage,
        });
        return actor;
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  /**
   * Finalizes account-controller commands into a persisted account block.
   * The returned block is the transactionally enqueued AccountRepo outbox row.
   *
   * 1. Decode the RPC request inside the existing handler.
   * 2. Acquire the coarse AccountRepo concurrency gate.
   * 3. Prepare snapshots and commit the local finalization while gated.
   * 4. Release the gate with expected failures still encoded in Effect.
   * 5. Drain subscriptions and account-block outboxes after release.
   */
  async finalizeAccountBlock(
    request: IRpcRequest<
      [
        {
          accountId: string;
          accountName: string;
          commands: readonly IAccountCommand[];
        },
      ]
    >,
  ): Promise<IRpcEnvelope<IAccountBlockOutboxRecord, IAnyErrorJson>> {
    const db = this.db;
    const key = this.key;
    const accountRepoName = this.ctx.id.name ?? '';
    const ctx = this.ctx;
    const storage = this.ctx.storage;
    return managedRuntime.runPromise(
      makeRpcHandler('AccountRepo.finalizeAccountBlock.rpc')(function* (props: {
        accountId: string;
        accountName: string;
        commands: readonly IAccountCommand[];
      }) {
        // 1 — makeRpcHandler keeps request and response envelope behavior unchanged
        return yield* Effect.gen(function* () {
          // 2 — block handleServiceBlocks and every other AccountRepo event before reading service watermarks
          const gated = yield* Effect.promise(() =>
            ctx.blockConcurrencyWhile(() =>
              managedRuntime.runPromise(
                // 3 — grouped ServiceRepo RPCs and the AccountRepo transaction complete under the same gate
                finalizeAccountBlock({
                  generationId: key.generationId,
                  accountId: props.accountId,
                  accountName: props.accountName,
                  commands: props.commands,
                  db,
                  storage,
                }).pipe(Effect.either),
              ),
            ),
          );
          // 4 — expected Effect failures leave the gate as values, not uncaught callback exceptions
          if (Either.isLeft(gated)) {
            return yield* gated.left;
          }
          const block = gated.right;
          // 5 — publication and ServiceBlockRepo subscription happen only after blockConcurrencyWhile releases
          yield* drainAccountOutboxes({
            accountRepoName,
            generationId: key.generationId,
            accountId: key.accountId,
            accountName: key.accountName,
            db,
            storage,
          });
          return block;
        }).pipe(
          Effect.mapError(error =>
            Schema.encodeSync(ZerospinError.schema)(Cause.originalError(error)),
          ),
        );
      })(request),
    );
  }

  /**
   * Finalizes one immutable FrontendRepo pushed block into authoritative
   * account command outcomes. Repeated pushed-block ids return the stored row.
   *
   * 1. Decode the pushed-block request inside the existing handler.
   * 2. Acquire the coarse AccountRepo concurrency gate.
   * 3. Batch pushed preparation and commit the local transaction while gated.
   * 4. Release the gate with expected failures still encoded in Effect.
   * 5. Drain subscriptions and account-block outboxes after release.
   */
  async finalizePushedCommands(
    request: IRpcRequest<[{ pushedBlock: IPushedBlock }]>,
  ): Promise<IRpcEnvelope<IAccountBlockOutboxRecord, IAnyErrorJson>> {
    const db = this.db;
    const key = this.key;
    const accountRepoName = this.ctx.id.name ?? '';
    const ctx = this.ctx;
    const storage = this.ctx.storage;
    return managedRuntime.runPromise(
      makeRpcHandler('AccountRepo.finalizePushedCommands.rpc')(
        function* (props: { pushedBlock: IPushedBlock }) {
          // 1 — makeRpcHandler preserves the pushed RPC envelope and trace boundary
          return yield* Effect.gen(function* () {
            // 2 — no service delivery can interleave after the subscription watermark is read
            const gated = yield* Effect.promise(() =>
              ctx.blockConcurrencyWhile(() =>
                managedRuntime.runPromise(
                  // 3 — adapter batching, grouped snapshots, alignment, and pushed outcomes commit together
                  finalizePushedCommands({
                    generationId: key.generationId,
                    accountId: key.accountId,
                    accountName: key.accountName,
                    pushedBlock: props.pushedBlock,
                    db,
                    storage,
                  }).pipe(Effect.either),
                ),
              ),
            );
            // 4 — expected Effect failures are re-entered after the gate releases
            if (Either.isLeft(gated)) {
              return yield* gated.left;
            }
            const block = gated.right;
            // 5 — outbox I/O stays outside the 30-second blockConcurrencyWhile callback
            yield* drainAccountOutboxes({
              accountRepoName,
              generationId: key.generationId,
              accountId: key.accountId,
              accountName: key.accountName,
              db,
              storage,
            });
            return block;
          }).pipe(
            Effect.mapError(error =>
              Schema.encodeSync(ZerospinError.schema)(
                Cause.originalError(error),
              ),
            ),
          );
        },
      )(request),
    );
  }

  async handleServiceBlocks(props: {
    serviceName: string;
    blocks: readonly IServiceBlock[];
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(this, function* () {
        const serviceRepoName =
          yield* ServiceRepo.repoUtils.nameUtils.makeName({
            generationId: this.key.generationId,
            serviceName: props.serviceName,
          });
        yield* handleServiceBlocks({
          ...props,
          accountName: this.key.accountName,
          serviceRepoName,
          db: this.db,
          storage: this.ctx.storage,
        });
        yield* drainAccountOutboxes({
          accountRepoName: this.ctx.id.name ?? '',
          generationId: this.key.generationId,
          accountId: this.key.accountId,
          accountName: this.key.accountName,
          db: this.db,
          storage: this.ctx.storage,
        });
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainAccountOutboxes(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainAccountOutboxes({
        accountRepoName: this.ctx.id.name ?? '',
        generationId: this.key.generationId,
        accountId: this.key.accountId,
        accountName: this.key.accountName,
        db: this.db,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        pendingServiceSubscriptionCount: number;
        pendingAccountBlockCount: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        accountId: this.key.accountId,
        accountName: this.key.accountName,
        accountRepoName: this.ctx.id.name ?? '',
        db: this.db,
        local: this.env.ZEROSPIN_INSTANCE_ID === 'local',
        generationId: this.key.generationId,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getReplaySubscriptions(): Promise<
    Schema.EitherEncoded<
      readonly Readonly<{
        serviceRepoName: string;
        serviceName: string;
        currentServiceCursor: IServiceCursorId;
        currentServiceIndex: number;
      }>[],
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getReplaySubscriptions({ db: this.db }).pipe(encodeRpc),
    );
  }

  async restoreReplaySubscription(props: {
    serviceName: string;
    currentServiceCursor: IServiceCursorId;
    currentServiceIndex: number;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        restored: boolean;
        serviceRepoName: string;
        serviceName: string;
        currentServiceCursor: IServiceCursorId;
        currentServiceIndex: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      restoreReplaySubscription({
        ...props,
        accountId: this.key.accountId,
        accountName: this.key.accountName,
        accountRepoName: this.ctx.id.name ?? '',
        db: this.db,
        generationId: this.key.generationId,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async replayAccountBlock(props: {
    deployId: string;
    prevGenerationId: string;
    block: IAccountBlock;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        replayed: boolean;
        lastAccountCursor: IAccountCursor;
        accountIndex: number;
        appliedMutationCount: number;
        discardedMutationCount: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      replayAccountBlock({
        ...props,
        accountId: this.key.accountId,
        accountName: this.key.accountName,
        accountRepoName: this.ctx.id.name ?? '',
        db: this.db,
        generationId: this.key.generationId,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await managedRuntime.runPromise(
      alarm({
        accountRepoName: this.ctx.id.name ?? '',
        generationId: this.key.generationId,
        accountId: this.key.accountId,
        accountName: this.key.accountName,
        db: this.db,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
