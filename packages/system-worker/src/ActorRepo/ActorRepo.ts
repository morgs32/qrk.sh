/*
 * System-worker annotation:
 * Defines the ActorRepo Durable Object shell and local storage wiring.
 * Public RPC/lifecycle methods should delegate to same-named Effect functions instead of growing inline workflow bodies here.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import { getActorController } from '@zerospin/core/accountController/getActorController';
import type { IActor } from '@zerospin/core/actorController/types';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAccountCursor,
  IActorId,
  IAnyTables,
  IEncodedResourceShape,
  InferDecodedRow,
  IShape,
} from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import {
  makeRpcHandler,
  type IRpcEnvelope,
  type IRpcRequest,
} from '@zerospin/logger';
import { Cause, Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';
import { assert, type Equals } from 'tsafe';

import { ActorDeltaSchema } from '../blockSchemas.js';
import {
  getLastAccountCursor,
  getLastAccountIndex,
} from '../getLastAccountCursor/getLastAccountCursor.js';
import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import type { IAccountBlock, IActorBlockOutboxRecord } from '../types.js';

import { authorize } from './authorize/authorize.js';
import { bootstrap } from './bootstrap/bootstrap.js';
import { dumpActorModelResources } from './dumpActorModelResources/dumpActorModelResources.js';
import { handleAccountBlocks } from './handleAccountBlocks/handleAccountBlocks.js';

const refShape = {
  resourceId: primitives.text({ unique: true }),
  modelName: primitives.text(),
} satisfies IShape;

const actorBlockOutboxShape = {
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
  deltas: primitives.json({
    schema: Schema.Record({
      key: Schema.String,
      value: ActorDeltaSchema,
    }),
  }),
  failure: primitives.json({ schema: ZerospinError.schema, nullable: true }),
} as const;

assert<
  Equals<InferDecodedRow<typeof actorBlockOutboxShape>, IActorBlockOutboxRecord>
>();

/** ActorRepo resource replica plus actor graph refs and the actor block outbox. */
const actorRepoTables = {
  graph: makeTable({
    name: 'graph',
    shape: refShape,
    indexes: [
      {
        name: 'actorRepo_graph_resourceId_unique',
        columns: ['resourceId'],
        unique: true,
      },
    ],
  }),
  actorBlockOutbox: makeTable({
    name: 'actorBlockOutbox',
    shape: actorBlockOutboxShape,
    indexes: [
      {
        name: 'actorBlockOutbox_accountIndex_unique',
        columns: ['accountIndex'],
        unique: true,
      },
    ],
  }),
} satisfies IAnyTables;

export const actorRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(actorRepoTables);

const actorRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.actorRepo,
  repoType: 'ActorRepo',
  namePattern: RoutePattern.parse(
    '/:generationId/:accountId/:accountName/:actorName/:actorId',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('ActorRepo.getDbConfig')(function* (props) {
    const { key } = props;
    const { accountName, actorName } = key;

    const actorController = yield* getActorController({
      system,
      accountName,
      actorName,
    });

    return makeResourceDbConfig({
      models: actorController.models,
      otherTables: actorRepoTables,
    });
  }),
  bootstrap,
});

/**
 * Actor-repo Durable Object (one per actor key, `ACTOR_REPO` binding).
 *
 * Applies finalized account blocks into the actor-scoped replica and publishes
 * pure actor blocks to ActorBlockRepo through `actorBlockOutbox`. FrontendRepo
 * owns the per-frontend projection.
 *
 * FrontendRepo owns command admission and AccountRepo owns authoritative
 * finalization. ActorRepo only projects finalized account blocks.
 */
export class ActorRepo extends makeRepo({
  repoUtils: actorRepoUtils,
}) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  async authorize(props: {
    actor: IActor;
    accountName: string;
    actorName: string;
    frontendName: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const { actor } = props;

    return managedRuntime.runPromise(
      authorize({
        actor,
        accountName: props.accountName,
        actorName: props.actorName,
        db: this.db,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getLastAccountCursor(): Promise<
    Schema.EitherEncoded<IAccountCursor | null, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(this, function* () {
        const lastAccountCursor = yield* getLastAccountCursor({
          storage: this.ctx.storage,
        });
        return lastAccountCursor ?? null;
      }).pipe(encodeRpc),
    );
  }

  async getLastAccountIndex(): Promise<
    Schema.EitherEncoded<number | null, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(this, function* () {
        const lastAccountIndex = yield* getLastAccountIndex({
          storage: this.ctx.storage,
        });
        return lastAccountIndex ?? null;
      }).pipe(encodeRpc),
    );
  }

  async dumpActorModelResources(props: {
    accountName: string;
    actorName: string;
    modelName: string;
  }): Promise<
    Schema.EitherEncoded<Array<IEncodedResourceShape>, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      dumpActorModelResources({
        ...props,
        actorId: this.key.actorId as IActorId,
        db: this.db,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async handleAccountBlocks(
    request: IRpcRequest<[readonly IAccountBlock[]]>,
  ): Promise<IRpcEnvelope<void, IAnyErrorJson>> {
    const db = this.db;
    const key = this.key;
    const storage = this.ctx.storage;
    return managedRuntime.runPromise(
      makeRpcHandler('ActorRepo.handleAccountBlocks.rpc')(function* (
        blocks: readonly IAccountBlock[],
      ) {
        return yield* handleAccountBlocks({
          blocks,
          db,
          key: {
            generationId: key.generationId,
            accountId: key.accountId,
            accountName: key.accountName,
            actorId: key.actorId,
            actorName: key.actorName,
          },
          storage,
        }).pipe(
          Effect.provide(AsyncLive),
          Effect.mapError(error =>
            Schema.encodeSync(ZerospinError.schema)(Cause.originalError(error)),
          ),
        );
      })(request),
    );
  }
}
