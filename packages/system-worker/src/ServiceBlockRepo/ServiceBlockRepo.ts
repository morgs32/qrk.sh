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
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import type { IServiceBlock } from '../types.js';

import { alarm } from './alarm/alarm.js';
import { drainAccountSubscribers } from './drainAccountSubscribers/drainAccountSubscribers.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { drainServiceFrontendSubscribers } from './drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.js';
import { getReplayBlock } from './getReplayBlock/getReplayBlock.js';
import { getReplayBound } from './getReplayBound/getReplayBound.js';
import { publish } from './publish/publish.js';
import { subscribeAccount } from './subscribeAccount/subscribeAccount.js';
import { subscribeServiceFrontend } from './subscribeServiceFrontend/subscribeServiceFrontend.js';

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
        abbreviation: systemWorkerAbbreviations.accountRepo,
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
  serviceFrontendSubscribers: makeTable({
    name: 'serviceFrontendSubscribers',
    shape: {
      serviceFrontendRepoName: primitives.primaryKey({
        abbreviation: systemWorkerAbbreviations.serviceFrontendRepo,
      }),
      serviceName: primitives.text(),
      actorName: primitives.text(),
      actorId: primitives.opaqueId({
        abbreviation: coreAbbreviations.actor,
      }),
      frontendName: primitives.text(),
      currentServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
        nullable: true,
      }),
      currentServiceIndex: primitives.integer({ nullable: true }),
      catchupThroughServiceCursor: primitives.cursor({
        abbreviation: coreAbbreviations.serviceCursor,
        nullable: true,
      }),
      catchupThroughServiceIndex: primitives.integer({ nullable: true }),
      status: primitives.enum({ values: ['catching-up', 'live'] }),
      lastDeliveryError: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

const serviceBlockDbConfig = makeDbConfig({ tables: serviceBlockTables });

export const serviceBlockDrizzleSchemas = serviceBlockDbConfig.schema;

const serviceBlockRepoUtils = makeRepoUtils({
  abbreviation: systemWorkerAbbreviations.serviceBlockRepo,
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

  async subscribeServiceFrontend(props: {
    serviceFrontendRepoName: string;
    serviceName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
    currentServiceCursor: IServiceCursorId | null;
    currentServiceIndex: number | null;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        throughServiceCursor: IServiceCursorId | null;
        throughServiceIndex: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    const encoded = await managedRuntime.runPromise(
      subscribeServiceFrontend({
        ...props,
        db: this.db,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainServiceFrontendSubscribers().then(
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
      Effect.gen(this, function* () {
        // Each drain claims a durable sequence before its first delivery await.
        // Only the newest claimant may delete the shared alarm after success.
        const drainSequence = yield* Effect.promise(() =>
          this.ctx.storage.transaction(async transaction => {
            const previousDrainSequence =
              (await transaction.get<number>(
                'serviceBlockSubscriberDrainSequence',
              )) ?? 0;
            const nextDrainSequence = previousDrainSequence + 1;
            await transaction.put(
              'serviceBlockSubscriberDrainSequence',
              nextDrainSequence,
            );
            return nextDrainSequence;
          }),
        );
        const accountNextRetryAt = yield* drainAccountSubscribers({
          db: this.db,
          serviceName: this.key.serviceName,
        });
        const serviceFrontendNextRetryAt =
          yield* drainServiceFrontendSubscribers({
            db: this.db,
            key: this.key,
            onlyServiceFrontendRepoName: null,
            failFast: false,
          });
        const nextRetryAt =
          accountNextRetryAt === null
            ? serviceFrontendNextRetryAt
            : serviceFrontendNextRetryAt === null
              ? accountNextRetryAt
              : Math.min(accountNextRetryAt, serviceFrontendNextRetryAt);
        yield* Effect.promise(() =>
          this.ctx.storage.transaction(async transaction => {
            const currentDrainSequence = await transaction.get<number>(
              'serviceBlockSubscriberDrainSequence',
            );
            const currentAlarm = await transaction.getAlarm();
            if (nextRetryAt === null) {
              if (currentDrainSequence === drainSequence) {
                await transaction.deleteAlarm();
              }
              return;
            }
            if (
              currentAlarm === null ||
              currentAlarm <= Date.now() ||
              nextRetryAt < currentAlarm
            ) {
              await transaction.setAlarm(nextRetryAt);
            }
          }),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainServiceFrontendSubscribers(): Promise<
    Schema.EitherEncoded<void, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(this, function* () {
        // This method shares the alarm with account delivery and alarm().
        // Claiming a new sequence prevents an older success from deleting a
        // retry alarm scheduled by a newer overlapping drain.
        const drainSequence = yield* Effect.promise(() =>
          this.ctx.storage.transaction(async transaction => {
            const previousDrainSequence =
              (await transaction.get<number>(
                'serviceBlockSubscriberDrainSequence',
              )) ?? 0;
            const nextDrainSequence = previousDrainSequence + 1;
            await transaction.put(
              'serviceBlockSubscriberDrainSequence',
              nextDrainSequence,
            );
            return nextDrainSequence;
          }),
        );
        const accountNextRetryAt = yield* drainAccountSubscribers({
          db: this.db,
          serviceName: this.key.serviceName,
        });
        const serviceFrontendNextRetryAt =
          yield* drainServiceFrontendSubscribers({
            db: this.db,
            key: this.key,
            onlyServiceFrontendRepoName: null,
            failFast: false,
          });
        const nextRetryAt =
          accountNextRetryAt === null
            ? serviceFrontendNextRetryAt
            : serviceFrontendNextRetryAt === null
              ? accountNextRetryAt
              : Math.min(accountNextRetryAt, serviceFrontendNextRetryAt);
        yield* Effect.promise(() =>
          this.ctx.storage.transaction(async transaction => {
            const currentDrainSequence = await transaction.get<number>(
              'serviceBlockSubscriberDrainSequence',
            );
            const currentAlarm = await transaction.getAlarm();
            if (nextRetryAt === null) {
              if (currentDrainSequence === drainSequence) {
                await transaction.deleteAlarm();
              }
              return;
            }
            if (
              currentAlarm === null ||
              currentAlarm <= Date.now() ||
              nextRetryAt < currentAlarm
            ) {
              await transaction.setAlarm(nextRetryAt);
            }
          }),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        pendingAccountSubscriberCount: number;
        pendingServiceFrontendSubscriberCount: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        db: this.db,
        generationId: this.key.generationId,
        inspectionOnly: this.env.ZEROSPIN_SELF_HOSTED === 'true',
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
    await managedRuntime.runPromise(
      alarm({
        db: this.db,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
