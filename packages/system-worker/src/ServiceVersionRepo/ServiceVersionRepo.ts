import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { Effect, Semaphore } from 'effect';

import type {
  IFanoutDelivery,
  IFanoutSubscriberRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';
import { ServiceChain } from '../ServiceChain/ServiceChain.js';
import type { serviceChainDbConfig } from '../ServiceChain/serviceChainDbConfig.js';
import { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';

import { authorizeServiceSession } from './authorizeServiceSession/authorizeServiceSession.js';
import { execute } from './execute/execute.js';
import { executeCommands } from './executeCommands/executeCommands.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { flush } from './flush/flush.js';
import { getReplicatedResources } from './getReplicatedResources/getReplicatedResources.js';
import { serviceVersionRepoDbConfig } from './serviceVersionRepoDbConfig.js';
import { serviceVersionRepoFixedDORepoConfig } from './serviceVersionRepoFixedDORepoConfig.js';
export class ServiceVersionRepo
  extends makeFixedDORepo({
    namespaceBinding: 'SERVICE_VERSION_REPO',
    fixedDORepoConfig: serviceVersionRepoFixedDORepoConfig,
  })
  implements IFanoutSubscriberRepo<{ name: 'admissionResultsFanout' }>
{
  static override readonly fixedDORepoConfig =
    serviceVersionRepoFixedDORepoConfig;

  readonly #execution = Semaphore.makeUnsafe(1);
  readonly #executionResultsOutbox = makeOutboxQueue({
    indexColumnName: 'serviceIndex',
    name: 'executionResultsOutbox',
    db: this.db,
    outboxTable: serviceVersionRepoDbConfig.schema.commands,
    alarmRegistry: this.alarmRegistry,
    retention: 'delete',
    storage: {
      readPage: throughIndex =>
        this.db
          .select()
          .from(serviceVersionRepoDbConfig.schema.commands)
          .where(
            and(
              isNull(serviceVersionRepoDbConfig.schema.commands.acknowledgedAt),
              throughIndex === undefined
                ? undefined
                : lte(
                    serviceVersionRepoDbConfig.schema.commands.serviceIndex,
                    throughIndex,
                  ),
            ),
          )
          .orderBy(asc(serviceVersionRepoDbConfig.schema.commands.serviceIndex))
          .limit(64)
          .all()
          .map(row => ({
            index: row.serviceIndex,
            row: {
              ...row,
              mutations: this.db
                .select()
                .from(serviceVersionRepoDbConfig.schema.mutations)
                .where(
                  eq(
                    serviceVersionRepoDbConfig.schema.mutations.serviceIndex,
                    row.serviceIndex,
                  ),
                )
                .orderBy(
                  asc(
                    serviceVersionRepoDbConfig.schema.mutations.mutationIndex,
                  ),
                )
                .all(),
            },
          })),
      hasPending: () =>
        this.db
          .select({
            index: serviceVersionRepoDbConfig.schema.commands.serviceIndex,
          })
          .from(serviceVersionRepoDbConfig.schema.commands)
          .where(
            isNull(serviceVersionRepoDbConfig.schema.commands.acknowledgedAt),
          )
          .limit(1)
          .get() !== undefined,
      recordFailure: (indices, failure) => {
        this.db
          .update(serviceVersionRepoDbConfig.schema.commands)
          .set({ lastDeliveryFailure: failure })
          .where(
            inArray(serviceVersionRepoDbConfig.schema.commands.serviceIndex, [
              ...indices,
            ]),
          )
          .run();
      },
      acknowledge: indices => {
        this.db.transaction(tx => {
          tx.delete(serviceVersionRepoDbConfig.schema.mutations)
            .where(
              inArray(
                serviceVersionRepoDbConfig.schema.mutations.serviceIndex,
                [...indices],
              ),
            )
            .run();
          tx.delete(serviceVersionRepoDbConfig.schema.commands)
            .where(
              inArray(serviceVersionRepoDbConfig.schema.commands.serviceIndex, [
                ...indices,
              ]),
            )
            .run();
        });
      },
    },
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const deliveries: (typeof serviceVersionRepoDbConfig.schema.commands.$inferSelect & {
          mutations: readonly (typeof serviceVersionRepoDbConfig.schema.mutations.$inferSelect)[];
        })[] = [];
        for (const row of rows) {
          if (!('mutations' in row) || !Array.isArray(row.mutations)) {
            return yield* makeZerospinError('execution-mutations-missing');
          }
          deliveries.push({ ...row, mutations: row.mutations });
        }
        const chain = yield* ServiceVersionChain.getRepo({
          key: this.key,
        });
        const receiver = yield* makeAsync(() => chain.resultsSubscriber);
        yield* makeAsync(() => receiver.receive(deliveries)).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        );
      }),
  });
  get executionResultsOutbox() {
    return this.#executionResultsOutbox;
  }
  admissionResultsFanoutSubscriber(sourceKey: {
    systemId: string;
    serviceName: string;
  }): ReturnType<
    typeof makeFanoutSubscriber<
      'admissionResultsFanout',
      typeof sourceKey,
      typeof this.key,
      typeof serviceChainDbConfig.schema.commands.$inferSelect
    >
  > {
    if (
      sourceKey.systemId !== this.key.systemId ||
      sourceKey.serviceName !== this.key.serviceName
    ) {
      throw makeZerospinError({
        code: 'service-fanout-source-invalid',
        message: 'Service fanout source must match the materializer owner',
      });
    }
    return makeFanoutSubscriber({
      name: 'admissionResultsFanout',
      sourceKey,
      key: this.key,
      getRepo: ServiceChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(serviceVersionRepoDbConfig.schema.head)
          .where(eq(serviceVersionRepoDbConfig.schema.head.singletonId, 1))
          .get()?.serviceIndex ?? 0,
      receive: ({
        rows,
      }: IFanoutDelivery<
        Parameters<typeof executeCommands>[0]['rows'][number]
      >) =>
        this.#executionResultsOutbox.drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            yield* this.#execution.withPermits(1)(
              executeCommands({ db: this.db, key: this.key, rows }),
            );
          }),
        ),
    });
  }
  async execute(props: { serviceIndex: number }) {
    return config.system.runtime.runPromise(
      this.#executionResultsOutbox
        .drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            return yield* execute({
              ...props,
              db: this.db,
              key: this.key,
              subscriber: this.admissionResultsFanoutSubscriber({
                systemId: this.key.systemId,
                serviceName: this.key.serviceName,
              }),
            });
          }),
        )
        .pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  async flush(serviceIndex: number) {
    return config.system.runtime.runPromise(
      flush({
        serviceIndex,
        repo: this,
        executionResultsOutbox: this.#executionResultsOutbox,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  async executeServiceQuery(
    props: Omit<
      Parameters<typeof executeServiceQuery>[0],
      'db' | 'serviceVersion'
    >,
  ) {
    return config.system.runtime.runPromise(
      this.#executionResultsOutbox
        .drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            yield* makeAsync(() =>
              this.admissionResultsFanoutSubscriber({
                systemId: this.key.systemId,
                serviceName: this.key.serviceName,
              }).catchup(),
            ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
            return yield* this.#execution.withPermits(1)(
              executeServiceQuery({
                ...props,
                serviceName: this.key.serviceName,
                serviceVersion: this.key.serviceVersion,
                db: this.db,
              }),
            );
          }),
        )
        .pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  async authorizeServiceSession(
    props: Omit<
      Parameters<typeof authorizeServiceSession>[0],
      'db' | 'serviceVersion'
    >,
  ) {
    return config.system.runtime.runPromise(
      this.#executionResultsOutbox
        .drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            yield* makeAsync(() =>
              this.admissionResultsFanoutSubscriber({
                systemId: this.key.systemId,
                serviceName: this.key.serviceName,
              }).catchup(),
            ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
            return yield* this.#execution.withPermits(1)(
              authorizeServiceSession({
                ...props,
                serviceName: this.key.serviceName,
                serviceVersion: this.key.serviceVersion,
                db: this.db,
              }),
            );
          }),
        )
        .pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  async getReplicatedResources(
    props: Omit<
      Parameters<typeof getReplicatedResources>[0],
      'db' | 'serviceVersion' | 'serviceName'
    >,
  ) {
    return config.system.runtime.runPromise(
      this.#executionResultsOutbox
        .drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            yield* makeAsync(() =>
              this.admissionResultsFanoutSubscriber({
                systemId: this.key.systemId,
                serviceName: this.key.serviceName,
              }).catchup(),
            ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
            return yield* getReplicatedResources({
              ...props,
              serviceName: this.key.serviceName,
              serviceVersion: this.key.serviceVersion,
              db: this.db,
            });
          }),
        )
        .pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
}
