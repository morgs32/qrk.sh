import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Semaphore } from 'effect';
import { system } from 'system';

import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { UserVersionedAggregateChain } from '../UserVersionedAggregateChain/UserVersionedAggregateChain.js';
import { VersionedAggregateChain } from '../VersionedAggregateChain/VersionedAggregateChain.js';
import { VersionedServiceChain } from '../VersionedServiceChain/VersionedServiceChain.js';

import { catchup } from './catchup/catchup.js';
import { execute } from './execute/execute.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { getState } from './getState/getState.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import { userVersionedAggregateRepoDbConfig } from './userVersionedAggregateRepoDbConfig.js';
import { userVersionedAggregateRepoFixedDORepoConfig } from './userVersionedAggregateRepoFixedDORepoConfig.js';

export class UserVersionedAggregateRepo extends makeFixedDORepo({
  namespaceBinding: 'USER_VERSIONED_AGGREGATE_REPO',
  fixedDORepoConfig: userVersionedAggregateRepoFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    userVersionedAggregateRepoFixedDORepoConfig;

  override onDOActivation() {
    return onDOActivation({ repo: this });
  }

  readonly #execution = Semaphore.makeUnsafe(1);
  readonly #deltas = makeOutboxQueue({
    name: 'deltas',
    db: this.db,
    outboxTable: userVersionedAggregateRepoDbConfig.schema.deltas,
    alarmRegistry: this.alarmRegistry,
    retention: 'delete',
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* UserVersionedAggregateChain.getRepo({
          key: this.key,
        });
        const receiver = yield* makeAsync(() => chain.deltasSubscriber);
        yield* makeAsync(() => receiver.receive(rows)).pipe(
          Effect.flatMap(decodeRpc),
        );
      }),
  });
  /*
   * Exposes the already bound deltas capability from UserVersionedAggregateRepo.
   *
   * 1. Return the bound capability.
   */
  get deltas() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#deltas;
  }
  /*
   * Bind finalized aggregate delivery and catch-up to the durable projection cursor.
   * Every receive holds the output lease before committing local replay.
   */
  replicaFanoutQueueSubscriber(
    sourceKey: Parameters<typeof VersionedAggregateChain.getRepo>[0]['key'],
  ): ReturnType<
    typeof makeFanoutSubscriber<
      'replicaFanoutQueue',
      typeof sourceKey,
      typeof this.key,
      Parameters<typeof execute>[0]['rows'][number]
    >
  > {
    if (
      sourceKey.systemId !== this.key.systemId ||
      sourceKey.aggregateId !== this.key.aggregateId ||
      sourceKey.aggregateName !== this.key.aggregateName ||
      sourceKey.aggregateVersion !== this.key.aggregateVersion
    ) {
      throw new ZerospinError({
        code: 'fanout-source-key-mismatch',
        message: 'Aggregate source does not match the bound replica',
      });
    }
    return makeFanoutSubscriber({
      name: 'replicaFanoutQueue',
      sourceKey,
      key: this.key,
      getRepo: VersionedAggregateChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(userVersionedAggregateRepoDbConfig.schema.projectionState)
          .where(
            eq(userVersionedAggregateRepoDbConfig.schema.projectionState.id, 1),
          )
          .get()?.aggregateIndex ?? 0,
      receive: (
        delivery: IFanoutDelivery<
          Parameters<typeof execute>[0]['rows'][number]
        >,
      ) =>
        Effect.gen({ self: this }, function* () {
          yield* this.#execution.withPermits(1)(
            Effect.gen({ self: this }, function* () {
              yield* this.alarmRegistry.hold('deltas');
              yield* execute({
                rows: delivery.rows,
                db: this.db,
                key: this.key,
              });
            }),
          );
          this.ctx.waitUntil(
            managedRuntime
              .runPromise(this.#deltas.drain().pipe(Effect.provide(AsyncLive)))
              .catch(() => undefined),
          );
        }),
    });
  }
  /*
   * Bind each pinned service to its own retained cursor. A source capability is
   * available only for the owning system and an already committed enrollment.
   */
  aggregateReplicaFanoutQueueSubscriber(
    sourceKey: Parameters<typeof VersionedServiceChain.getRepo>[0]['key'],
  ): ReturnType<
    typeof makeFanoutSubscriber<
      'aggregateReplicaFanoutQueue',
      typeof sourceKey,
      typeof this.key,
      Parameters<typeof execute>[0]['rows'][number]
    >
  > {
    const aggregate = Effect.runSync(
      getByKeyOrThrow({
        record: system.aggregates,
        key: this.key.aggregateName,
        recordKind: 'aggregates',
      }).pipe(
        Effect.flatMap(aggregate =>
          getByKeyOrThrow({
            record: aggregate,
            key: this.key.aggregateVersion,
            recordKind: 'aggregate versions',
          }),
        ),
      ),
    );
    const source = this.db
      .select()
      .from(userVersionedAggregateRepoDbConfig.schema.services)
      .where(
        eq(
          userVersionedAggregateRepoDbConfig.schema.services.serviceName,
          sourceKey.serviceName,
        ),
      )
      .get();
    if (
      sourceKey.systemId !== this.key.systemId ||
      source === undefined ||
      aggregate.services[sourceKey.serviceName] !== sourceKey.serviceVersion
    ) {
      throw new ZerospinError({
        code: 'replica-source-not-enrolled',
        message: 'Service source does not match a committed replica enrollment',
      });
    }
    return makeFanoutSubscriber({
      name: 'aggregateReplicaFanoutQueue',
      sourceKey,
      key: this.key,
      getRepo: VersionedServiceChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(userVersionedAggregateRepoDbConfig.schema.services)
          .where(
            eq(
              userVersionedAggregateRepoDbConfig.schema.services.serviceName,
              sourceKey.serviceName,
            ),
          )
          .get()?.lastIndex ?? 0,
      receive: (
        delivery: IFanoutDelivery<
          Parameters<typeof execute>[0]['rows'][number]
        >,
      ) =>
        Effect.gen({ self: this }, function* () {
          yield* this.#execution.withPermits(1)(
            Effect.gen({ self: this }, function* () {
              yield* this.alarmRegistry.hold('deltas');
              yield* execute({
                rows: delivery.rows,
                db: this.db,
                key: this.key,
                source: sourceKey,
              });
            }),
          );
          this.ctx.waitUntil(
            managedRuntime
              .runPromise(this.#deltas.drain().pipe(Effect.provide(AsyncLive)))
              .catch(() => undefined),
          );
        }),
    });
  }
  /*
   * Snapshot reads catch this replica up through a bounded VAC tip, then enroll
   * at the committed projection cursor. Replay uses the live receive operation
   * and holds durable alarm leases for the outputs it creates.
   *
   * 1. Run the bound domain operation.
   */
  async catchup(props?: { throughAggregateIndex?: number }) {
    // 1 — run catchup with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      catchup({
        ...props,
        subscriber: this.replicaFanoutQueueSubscriber(this.key),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
  /*
   * Frontend snapshots capture selected state and its cursor, publish through
   * that cursor, then reconcile requested command outcomes from UVAC.
   * Publication waits occur after releasing the local execution permit.
   *
   * 1. Run the bound domain operation.
   */
  async getState(props: Parameters<typeof getState>[0]['requested']) {
    // 1 — run getState with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      getState({
        db: this.db,
        key: this.key,
        requested: props,
        subscriber: this.replicaFanoutQueueSubscriber(this.key),
        serviceSubscriber:
          this.aggregateReplicaFanoutQueueSubscriber.bind(this),
        execution: this.#execution,
        deltas: this.#deltas,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
  /*
   * Replica callers inspect the locally committed projection cursor.
   * This reader reports local progress; publication durability is checked separately
   * by the snapshot path.
   *
   * 1. Run the bound domain operation.
   */
  async getProjectionReadiness() {
    // 1 — run getProjectionReadiness with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      getProjectionReadiness({ db: this.db, key: this.key }).pipe(encodeRpc),
    );
  }
}
