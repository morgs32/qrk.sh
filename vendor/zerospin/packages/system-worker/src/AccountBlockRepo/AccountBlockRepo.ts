/*
 * System-worker annotation:
 * Defines the AccountBlockRepo Durable Object shell and storage wiring.
 * It is the concrete account block archive and actor delivery owner.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IAccountCursor } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import {
  makeRpcHandler,
  makeTelemetryCollector,
  makeTelemetryLayer,
  TelemetryCollector,
  type IRpcEnvelope,
  type IRpcRequest,
} from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { Cause, Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import { getSystemLogRepo } from '../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import type { IAccountBlock } from '../types.js';

import { accountBlockTables } from './accountBlockDrizzleSchemas.js';
import { alarm } from './alarm/alarm.js';
import { drainActorOutbox } from './drainActorOutbox/drainActorOutbox.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { getReplayBlock } from './getReplayBlock/getReplayBlock.js';
import { getReplayBound } from './getReplayBound/getReplayBound.js';
import { processSubscriber } from './processSubscriber/processSubscriber.js';
import { publish } from './publish/publish.js';
import { refreshQueue } from './refreshQueue/refreshQueue.js';
import { subscribeActor } from './subscribeActor/subscribeActor.js';

const DELIVERY_CONCURRENCY = 100;
const DELIVERY_BATCH_SIZE = 100;
const DELIVERY_ALARM_DELAY_MS = 250;

const accountBlockRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.accountBlockRepo,
  repoType: 'AccountBlockRepo',
  namePattern: RoutePattern.parse('/:generationId/:accountId/:accountName'),
  managedRuntime,
  getDbConfig: Effect.fn('AccountBlockRepo.getDbConfig')(function* () {
    yield* Effect.void;
    return makeDbConfig({
      tables: accountBlockTables,
    });
  }),
});

export class AccountBlockRepo extends makeRepo({
  repoUtils: accountBlockRepoUtils,
}) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = accountBlockRepoUtils;

  readonly #deliveriesByActorRepoName = new Map<
    string,
    Effect.Effect.Success<ReturnType<typeof refreshQueue>>[number]
  >();
  readonly #queuedActorRepoNames: string[] = [];
  #running: Promise<void> | null = null;

  async publish(
    request: IRpcRequest<[IAccountBlock]>,
  ): Promise<IRpcEnvelope<void, IAnyErrorJson>> {
    const db = this.db;
    const storage = this.ctx.storage;
    const envelope = await managedRuntime.runPromise(
      makeRpcHandler('AccountBlockRepo.publish.rpc')(function* (
        block: IAccountBlock,
      ) {
        return yield* publish({
          block,
          db,
          storage,
        }).pipe(
          Effect.mapError(error =>
            Schema.encodeSync(ZerospinError.schema)(Cause.originalError(error)),
          ),
        );
      })(request),
    );
    this.ctx.waitUntil(
      this.drainActorOutbox().then(
        () => undefined,
        () => undefined,
      ),
    );
    return envelope;
  }

  async subscribeActor(props: {
    actorId: string;
    actorName: string;
    currentAccountCursor: IAccountCursor | null;
    currentAccountIndex: number | null;
    actorRepoName: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const encoded = await managedRuntime.runPromise(
      subscribeActor({
        ...props,
        accountId: this.key.accountId,
        accountName: this.key.accountName,
        db: this.db,
      }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      this.drainActorOutbox().then(
        () => undefined,
        () => undefined,
      ),
    );
    return encoded;
  }

  async getReplayBound(): Promise<
    Schema.EitherEncoded<
      Readonly<{
        lastAccountCursor: IAccountCursor | null;
        accountIndex: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getReplayBound({ db: this.db }).pipe(encodeRpc),
    );
  }

  async getReplayBlock(props: {
    afterAccountIndex: number | null;
    throughAccountIndex: number;
  }): Promise<Schema.EitherEncoded<IAccountBlock | null, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getReplayBlock({ ...props, db: this.db }).pipe(encodeRpc),
    );
  }

  async drainActorOutbox(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const db = this.db;
    const generationId = this.key.generationId;
    const storage = this.ctx.storage;
    const collector = makeTelemetryCollector();
    const encoded = await managedRuntime.runPromise(
      drainActorOutbox({
        storage,
        deliveriesByActorRepoName: this.#deliveriesByActorRepoName,
        queuedActorRepoNames: this.#queuedActorRepoNames,
        concurrency: DELIVERY_CONCURRENCY,
        alarmDelayMs: DELIVERY_ALARM_DELAY_MS,
        refresh: () =>
          refreshQueue({
            db,
            deliveryBatchSize: DELIVERY_BATCH_SIZE,
          }),
        processSubscriber: subscriberDelivery =>
          processSubscriber({
            db,
            storage,
            subscriberDelivery,
          }).pipe(
            Effect.provide(AsyncLive),
            Effect.provideService(TelemetryCollector, collector),
          ),
        getRunning: () => this.#running,
        setRunning: running => {
          this.#running = running;
        },
      }).pipe(Effect.provide(makeTelemetryLayer(collector)), encodeRpc),
    );

    const batch = collector.flush();
    await managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemLogRepo = yield* getSystemLogRepo({ key: { generationId } });
        const encoded = yield* makeAsync(() =>
          systemLogRepo.appendTelemetryBatch({
            batch,
            deployId: env.ZEROSPIN_DEPLOY_ID,
          }),
        );
        yield* decodeRpc(encoded);
      }).pipe(
        Effect.catchAll(() => Effect.void),
        Effect.provide(AsyncLive),
      ),
    );

    return encoded;
  }

  async drainGeneration(): Promise<
    Schema.EitherEncoded<
      Readonly<{ pendingActorSubscriberCount: number }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration({
        db: this.db,
        hostedDrain: makeAsync(() => this.drainActorOutbox()).pipe(
          Effect.flatMap(decodeRpc),
        ),
        local: this.env.ZEROSPIN_INSTANCE_ID === 'local',
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    const db = this.db;
    const generationId = this.key.generationId;
    const storage = this.ctx.storage;
    const collector = makeTelemetryCollector();
    const encoded = await managedRuntime.runPromise(
      alarm({
        storage,
        start: () =>
          drainActorOutbox({
            storage,
            deliveriesByActorRepoName: this.#deliveriesByActorRepoName,
            queuedActorRepoNames: this.#queuedActorRepoNames,
            concurrency: DELIVERY_CONCURRENCY,
            alarmDelayMs: DELIVERY_ALARM_DELAY_MS,
            refresh: () =>
              refreshQueue({
                db,
                deliveryBatchSize: DELIVERY_BATCH_SIZE,
              }),
            processSubscriber: subscriberDelivery =>
              processSubscriber({
                db,
                storage,
                subscriberDelivery,
              }).pipe(
                Effect.provide(AsyncLive),
                Effect.provideService(TelemetryCollector, collector),
              ),
            getRunning: () => this.#running,
            setRunning: running => {
              this.#running = running;
            },
          }),
      }).pipe(Effect.provide(makeTelemetryLayer(collector)), encodeRpc),
    );

    const batch = collector.flush();
    await managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemLogRepo = yield* getSystemLogRepo({ key: { generationId } });
        const encoded = yield* makeAsync(() =>
          systemLogRepo.appendTelemetryBatch({
            batch,
            deployId: env.ZEROSPIN_DEPLOY_ID,
          }),
        );
        yield* decodeRpc(encoded);
      }).pipe(
        Effect.catchAll(() => Effect.void),
        Effect.provide(AsyncLive),
      ),
    );

    await managedRuntime.runPromise(decodeRpc(encoded));
  }
}
