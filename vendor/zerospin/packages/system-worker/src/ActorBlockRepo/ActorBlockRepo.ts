/*
 * System-worker annotation:
 * Defines the ActorBlockRepo Durable Object shell and storage wiring.
 * It archives actor blocks published by ActorRepo and durably fans them out to
 * subscribed FrontendRepos. It does not own frontend state or websockets.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAccountCursor,
  IAnyTables,
  InferDecodedRow,
} from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { assert, type Equals } from 'tsafe';

import { ActorDeltaSchema } from '../blockSchemas.js';
import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import type { IActorBlock } from '../types.js';

import { drainFrontendSubscribers } from './drainFrontendSubscribers/drainFrontendSubscribers.js';
import { storeActorBlocks } from './storeActorBlocks/storeActorBlocks.js';
import { subscribeFrontend } from './subscribeFrontend/subscribeFrontend.js';

const actorBlockShape = {
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
} as const;

assert<Equals<InferDecodedRow<typeof actorBlockShape>, IActorBlock>>();

const actorBlockTables = {
  actorBlocks: makeTable({
    name: 'actorBlocks',
    shape: actorBlockShape,
    indexes: [
      {
        name: 'actorBlocks_accountIndex_unique',
        columns: ['accountIndex'],
        unique: true,
      },
    ],
  }),
  frontendSubscribers: makeTable({
    name: 'frontendSubscribers',
    shape: {
      frontendRepoName: primitives.primaryKey({
        abbreviation: coreAbbreviations.frontendRepo,
      }),
      frontendName: primitives.text(),
      currentAccountCursor: primitives.cursor({
        abbreviation: coreAbbreviations.accountCursor,
        nullable: true,
      }),
      currentAccountIndex: primitives.integer({ nullable: true }),
      deliveryAttempts: primitives.integer(),
      nextRetryAt: primitives.integer({ nullable: true }),
      lastDeliveryError: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

const actorBlockDbConfig = makeDbConfig({ tables: actorBlockTables });

export const actorBlockDrizzleSchemas = actorBlockDbConfig.schema;

const actorBlockRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.actorBlockRepo,
  repoType: 'ActorBlockRepo',
  namePattern: RoutePattern.parse(
    '/:generationId/:accountId/:accountName/:actorName/:actorId',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('ActorBlockRepo.getDbConfig')(function* () {
    yield* Effect.void;
    return actorBlockDbConfig;
  }),
});

/** Actor-block archive and durable fanout to one FrontendRepo per frontend. */
export class ActorBlockRepo extends makeRepo({
  repoUtils: actorBlockRepoUtils,
}) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = actorBlockRepoUtils;

  async storeActorBlocks(props: {
    blocks: readonly IActorBlock[];
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      storeActorBlocks({
        blocks: props.blocks,
        db: this.db,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainFrontendSubscribers().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async subscribeFrontend(props: {
    frontendRepoName: string;
    frontendName: string;
    currentAccountCursor: IAccountCursor | null;
    currentAccountIndex: number | null;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      subscribeFrontend({ ...props, db: this.db }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainFrontendSubscribers().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async drainFrontendSubscribers(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainFrontendSubscribers({
        db: this.db,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await this.drainFrontendSubscribers();
  }
}
