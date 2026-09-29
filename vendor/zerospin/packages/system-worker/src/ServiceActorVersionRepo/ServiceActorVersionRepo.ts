import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq, isNotNull } from 'drizzle-orm';
import { Effect } from 'effect';

import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';
import { ServiceActorVersionChain } from '../ServiceActorVersionChain/ServiceActorVersionChain.js';
import { serviceActorVersionChainDbConfig } from '../ServiceActorVersionChain/serviceActorVersionChainDbConfig.js';
import { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';

import { catchup } from './catchup/catchup.js';
import { execute } from './execute/execute.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import { serviceActorVersionRepoDbConfig } from './serviceActorVersionRepoDbConfig.js';
import { serviceActorVersionRepoFixedDORepoConfig } from './serviceActorVersionRepoFixedDORepoConfig.js';
export class ServiceActorVersionRepo extends makeFixedDORepo({
  namespaceBinding: 'SERVICE_ACTOR_VERSION_REPO',
  fixedDORepoConfig: serviceActorVersionRepoFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    serviceActorVersionRepoFixedDORepoConfig;
  override onDOActivation() {
    return onDOActivation({ repo: this });
  }

  readonly #actorCommandsOutbox = makeOutboxQueue({
    indexColumnName: 'actorServiceIndex',
    name: 'actorCommandsOutbox',
    db: this.db,
    outboxTable: serviceActorVersionRepoDbConfig.schema.commands,
    where: isNotNull(
      serviceActorVersionRepoDbConfig.schema.commands.actorServiceIndex,
    ),
    alarmRegistry: this.alarmRegistry,
    retention: 'retain',
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* ServiceActorVersionChain.getRepo({
          key: this.key,
        });
        const receiver = yield* makeAsync(() => chain.actorCommandsSubscriber);
        const output = yield* Effect.forEach(rows, row =>
          Effect.gen(function* () {
            const decoded =
              yield* serviceActorVersionRepoDbConfig.tables.commands.decodeRow(
                row,
              );
            if (
              decoded.actorServiceIndex === null ||
              decoded.serviceHash === null ||
              decoded.actorDelta === null
            ) {
              return yield* makeZerospinError(
                'service-actor-output-incomplete',
              );
            }
            return yield* serviceActorVersionChainDbConfig.tables.commands.encodeRow(
              {
                ...decoded,
                acknowledgedAt: null,
                lastDeliveryFailure: null,
              },
            );
          }),
        );
        yield* makeAsync(() => receiver.receive(output)).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        );
      }).pipe(
        Effect.mapError(error =>
          makeZerospinError({
            code: 'service-actor-delivery-failed',
            cause: String(error),
          }),
        ),
      ),
  });
  /*
   * Exposes the already bound actor-command capability from ServiceActorVersionRepo.
   *
   * 1. Return the bound capability.
   */
  get actorCommandsOutbox() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#actorCommandsOutbox;
  }
  /*
   * Bind one selected service source to the replica's durable projection cursor.
   * Pulled and pushed pages share synchronous replay transactions and an output alarm.
   */
  executionResultsFanoutSubscriber(
    sourceKey: Parameters<typeof ServiceVersionChain.getRepo>[0]['key'],
  ): ReturnType<
    typeof makeFanoutSubscriber<
      'executionResultsFanout',
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
      throw makeZerospinError({
        code: 'fanout-source-key-mismatch',
        message: 'Service source does not match the bound replica',
      });
    }
    return makeFanoutSubscriber({
      name: 'executionResultsFanout',
      sourceKey,
      key: this.key,
      getRepo: ServiceVersionChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(serviceActorVersionRepoDbConfig.schema.actorState)
          .where(eq(serviceActorVersionRepoDbConfig.schema.actorState.id, 1))
          .get()?.serviceIndex ?? 0,
      receive: (
        delivery: IFanoutDelivery<
          Parameters<typeof execute>[0]['rows'][number]
        >,
      ) =>
        this.#actorCommandsOutbox.drainAfter(() =>
          execute({ rows: delivery.rows, db: this.db, key: this.key }),
        ),
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
    return config.system.runtime.runPromise(
      catchup({
        ...props,
        subscriber: this.executionResultsFanoutSubscriber(this.key),
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  /*
   * Session snapshot reads capture projected state and resolved command IDs
   * together, then ensure the captured cursor is durably published to FSC.
   * Publication waits occur after the synchronous capture transaction completes.
   *
   * 1. Run the bound domain operation.
   */
  async getSnapshot(props: Parameters<typeof getSnapshot>[0]['requested']) {
    // 1 — run getSnapshot with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getSnapshot({
        db: this.db,
        key: this.key,
        requested: props,
        actorCommandsOutbox: this.#actorCommandsOutbox,
        subscriber: this.executionResultsFanoutSubscriber(this.key),
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
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
    return config.system.runtime.runPromise(
      getProjectionReadiness({ db: this.db, key: this.key }).pipe(
        makeRpcEnvelope,
      ),
    );
  }
}
