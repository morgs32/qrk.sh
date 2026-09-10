import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Semaphore } from 'effect';

import { FrontendServiceChain } from '../FrontendServiceChain/FrontendServiceChain.js';
import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { VersionedServiceChain } from '../VersionedServiceChain/VersionedServiceChain.js';

import { catchup } from './catchup/catchup.js';
import { execute } from './execute/execute.js';
import { frontendVersionedServiceRepoDbConfig } from './frontendVersionedServiceRepoDbConfig.js';
import { frontendVersionedServiceRepoFixedDORepoConfig } from './frontendVersionedServiceRepoFixedDORepoConfig.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { getState } from './getState/getState.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
export class FrontendVersionedServiceRepo extends makeFixedDORepo({
  namespaceBinding: 'FRONTEND_VERSIONED_SERVICE_REPO',
  fixedDORepoConfig: frontendVersionedServiceRepoFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    frontendVersionedServiceRepoFixedDORepoConfig;
  override onDOActivation() {
    return onDOActivation({ repo: this });
  }

  readonly #execution = Semaphore.makeUnsafe(1);
  readonly #deltas = makeOutboxQueue({
    name: 'deltas',
    db: this.db,
    outboxTable: frontendVersionedServiceRepoDbConfig.schema.deltas,
    alarmRegistry: this.alarmRegistry,
    retention: 'delete',
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* FrontendServiceChain.getRepo({
          key: this.key,
        });
        const receiver = yield* makeAsync(() => chain.deltasSubscriber);
        yield* makeAsync(() => receiver.receive(rows)).pipe(
          Effect.flatMap(decodeRpc),
        );
      }),
  });
  /*
   * Exposes the already bound deltas capability from FrontendVersionedServiceRepo.
   *
   * 1. Return the bound capability.
   */
  get deltas() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#deltas;
  }
  /*
   * Bind one finalized service source to the replica's durable projection cursor.
   * Pulled and pushed pages share the same execution permit and output alarm.
   */
  replicaFanoutQueueSubscriber(
    sourceKey: Parameters<typeof VersionedServiceChain.getRepo>[0]['key'],
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
      sourceKey.serviceName !== this.key.serviceName ||
      sourceKey.serviceVersion !== this.key.serviceVersion
    ) {
      throw new ZerospinError({
        code: 'fanout-source-key-mismatch',
        message: 'Service source does not match the bound replica',
      });
    }
    return makeFanoutSubscriber({
      name: 'replicaFanoutQueue',
      sourceKey,
      key: this.key,
      getRepo: VersionedServiceChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(frontendVersionedServiceRepoDbConfig.schema.projectionState)
          .where(
            eq(
              frontendVersionedServiceRepoDbConfig.schema.projectionState.id,
              1,
            ),
          )
          .get()?.serviceIndex ?? 0,
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
   * Snapshot reads catch this replica up through a bounded VSC tip, then enroll
   * at the committed projection cursor. Replay uses the live receive operation
   * and holds a durable alarm lease for the outputs it creates.
   *
   * 1. Run the bound domain operation.
   */
  async catchup(props?: { throughServiceIndex?: number }) {
    // 1 — run catchup with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      catchup({
        ...props,
        subscriber: this.replicaFanoutQueueSubscriber(this.key),
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
  /*
   * Frontend snapshot reads capture projected state and resolved command IDs
   * together, then ensure the captured cursor is durably published to FSC.
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
        execution: this.#execution,
        deltas: this.#deltas,
        subscriber: this.replicaFanoutQueueSubscriber(this.key),
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
