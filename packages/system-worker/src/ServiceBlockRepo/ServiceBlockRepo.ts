/*
 * ServiceBlockRepo is the singleton durable service-block archive and the
 * delivery owner for every AccountRepo that permanently replicates from one service.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables, IServiceCursorId } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import { ServiceBlockSchema } from '../blockSchemas.js';
import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import type { IServiceBlock } from '../types.js';

import { drainAccountSubscribers } from './drainAccountSubscribers/drainAccountSubscribers.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { getReplayBlock } from './getReplayBlock/getReplayBlock.js';
import { getReplayBound } from './getReplayBound/getReplayBound.js';
import { publish } from './publish/publish.js';
import { subscribeAccount } from './subscribeAccount/subscribeAccount.js';

const serviceBlockTables = {
  serviceBlocks: makeTable({
    name: 'serviceBlocks',
    shape: {
      lastServiceCursor: primitives.primaryKey({
        abbreviation: coreAbbreviations.serviceCursor,
      }),
      serviceIndex: primitives.integer({ unique: true }),
      block: primitives.json({ schema: ServiceBlockSchema }),
    },
  }),
  accountSubscribers: makeTable({
    name: 'accountSubscribers',
    shape: {
      accountRepoName: primitives.primaryKey({
        abbreviation: coreAbbreviations.accountRepo,
      }),
      accountId: primitives.text(),
      accountName: primitives.text(),
      currentServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
      }),
      currentServiceIndex: primitives.integer(),
      deliveryAttempts: primitives.integer(),
      nextRetryAt: primitives.integer({ nullable: true }),
      lastDeliveryError: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

const serviceBlockDbConfig = makeDbConfig({ tables: serviceBlockTables });

export const serviceBlockDrizzleSchemas = serviceBlockDbConfig.schema;

const serviceBlockRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.serviceBlockRepo,
  repoType: 'ServiceBlockRepo',
  namePattern: RoutePattern.parse('/:generationId/:serviceName'),
  managedRuntime,
  getDbConfig: Effect.fn('ServiceBlockRepo.getDbConfig')(function* () {
    yield* Effect.void;
    return serviceBlockDbConfig;
  }),
});

export class ServiceBlockRepo extends makeRepo({
  repoUtils: serviceBlockRepoUtils,
}) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = serviceBlockRepoUtils;

  async publish(
    block: IServiceBlock,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      publish({ block, db: this.db }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainAccountSubscribers().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async subscribeAccount(props: {
    accountRepoName: string;
    accountId: string;
    accountName: string;
    currentServiceCursor: IServiceCursorId;
    currentServiceIndex: number;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      subscribeAccount({ ...props, db: this.db }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainAccountSubscribers().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async drainAccountSubscribers(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      drainAccountSubscribers({
        db: this.db,
        storage: this.ctx.storage,
        serviceName: this.key.serviceName,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{ pendingAccountSubscriberCount: number }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        db: this.db,
        local: this.env.ZEROSPIN_INSTANCE_ID === 'local',
        serviceName: this.key.serviceName,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getReplayBound(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        lastServiceCursor: IServiceCursorId | null;
        serviceIndex: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getReplayBound({ db: this.db }).pipe(encodeRpc),
    );
  }

  async getReplayBlock(props: {
    afterServiceIndex: number | null;
    throughServiceIndex: number;
  }): Promise<Schema.EitherEncoded<IServiceBlock | null, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getReplayBlock({ ...props, db: this.db }).pipe(encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    await this.drainAccountSubscribers();
  }
}
