import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { ServiceTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, type IZerospinErrorJson } from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq, inArray } from 'drizzle-orm';
import { Effect, Semaphore } from 'effect';

import { asyncOperationsDbConfig } from '../asyncOperations/asyncOperationsDbConfig.js';
import { makeAsyncOperations } from '../asyncOperations/makeAsyncOperations.js';
import {
  makePreparedServiceCommand,
  readPreparedAsyncWork,
  resolveWorkContract,
} from '../asyncOperations/readPreparedAsyncCommand.js';
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
import {
  readExecutedCommandsPage,
  type IExecutedCommandDelivery,
} from './readExecutedCommandsPage.js';
import { serviceVersionRepoDbConfig } from './serviceVersionRepoDbConfig.js';
import { serviceVersionRepoFixedDORepoConfig } from './serviceVersionRepoFixedDORepoConfig.js';
export class ServiceVersionRepo
  extends makeFixedDORepo({
    namespaceBinding: 'SERVICE_VERSION_REPO',
    fixedDORepoConfig: serviceVersionRepoFixedDORepoConfig,
  })
  implements
    IFanoutSubscriberRepo<{
      name: 'admittedCommandsFanout';
    }>
{
  static override readonly fixedDORepoConfig =
    serviceVersionRepoFixedDORepoConfig;

  readonly #asyncCommandOutbox = makeOutboxQueue({
    name: 'asyncCommandOutbox',
    db: this.db,
    alarmRegistry: this.alarmRegistry,
    outboxTable: asyncOperationsDbConfig.schema.asyncCommandOutbox,
    indexColumnName: 'outboxIndex',

    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* ServiceChain.getRepo({
          key: {
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
          },
        });
        for (const row of rows) {
          const work = yield* readPreparedAsyncWork(
            this.db,
            row.asyncCommandId,
          );
          const owner =
            config.system.services[this.key.serviceName]?.[
              this.key.serviceVersion
            ];
          if (owner === undefined) {
            return yield* makeZerospinError('async-owner-unavailable');
          }
          const contract = yield* resolveWorkContract(owner, work);
          const command = yield* makePreparedServiceCommand(
            work,
            contract,
            this.key,
          );
          yield* makeAsync<
            Awaited<ReturnType<ServiceChain['admitAsyncCommand']>>
          >(() =>
            chain.admitAsyncCommand({
              ownerVersion: this.key.serviceVersion,
              command,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
        }
      }),
  });
  readonly #asyncOperations = makeAsyncOperations({
    db: this.db,
    alarms: this.alarmRegistry,
    resolve: work =>
      Effect.gen({ self: this }, function* () {
        const owner =
          config.system.services[this.key.serviceName]?.[
            this.key.serviceVersion
          ];
        if (owner === undefined) {
          return yield* makeZerospinError('async-operation-owner-unavailable');
        }
        return yield* resolveWorkContract(owner, work);
      }),
    run: program =>
      config.system.runtime.runPromise(program.pipe(Effect.provide(AsyncLive))),
    background: promise => this.ctx.waitUntil(promise),
    deliver: () => this.#asyncCommandOutbox.drain(),
  });
  async getPreparedAsyncCommand(props: { commandId: string }) {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        const work = yield* readPreparedAsyncWork(this.db, props.commandId);
        const owner =
          config.system.services[this.key.serviceName]?.[
            this.key.serviceVersion
          ];
        if (owner === undefined) {
          return yield* makeZerospinError('async-operation-owner-unavailable');
        }
        const contract = yield* resolveWorkContract(owner, work);
        return yield* makePreparedServiceCommand(work, contract, this.key);
      }).pipe(makeRpcEnvelope),
    );
  }
  readonly #execution = Semaphore.makeUnsafe(1);

  override onDOActivation() {
    return this.#asyncOperations.recover();
  }
  readonly #executedCommandOutbox = makeOutboxQueue({
    indexColumnName: 'executedIndex',
    name: 'executedCommandOutbox',
    db: this.db,
    outboxTable: serviceVersionRepoDbConfig.schema.executedCommandOutbox,
    alarmRegistry: this.alarmRegistry,

    storage: {
      readPage: throughIndex => readExecutedCommandsPage(this.db, throughIndex),
      hasPending: () =>
        this.db
          .select({
            index:
              serviceVersionRepoDbConfig.schema.executedCommandOutbox
                .executedIndex,
          })
          .from(serviceVersionRepoDbConfig.schema.executedCommandOutbox)

          .limit(1)
          .get() !== undefined,
      recordFailure: (indices, failure) => {
        this.db
          .update(serviceVersionRepoDbConfig.schema.executedCommandOutbox)
          .set({ lastDeliveryFailure: failure })
          .where(
            inArray(
              serviceVersionRepoDbConfig.schema.executedCommandOutbox
                .executedIndex,
              [...indices],
            ),
          )
          .run();
      },
      acknowledge: indices => {
        this.db.transaction(tx => {
          const serviceIndices = tx
            .select({
              serviceIndex:
                serviceVersionRepoDbConfig.schema.executedCommandOutbox
                  .serviceIndex,
            })
            .from(serviceVersionRepoDbConfig.schema.executedCommandOutbox)
            .where(
              inArray(
                serviceVersionRepoDbConfig.schema.executedCommandOutbox
                  .executedIndex,
                [...indices],
              ),
            )
            .all()
            .map(row => row.serviceIndex)
            .filter((index): index is number => index !== null);
          if (serviceIndices.length > 0) {
            tx.delete(serviceVersionRepoDbConfig.schema.modelOperations)
              .where(
                inArray(
                  serviceVersionRepoDbConfig.schema.modelOperations
                    .serviceIndex,
                  serviceIndices,
                ),
              )
              .run();
            tx.delete(serviceVersionRepoDbConfig.schema.commands)
              .where(
                inArray(
                  serviceVersionRepoDbConfig.schema.commands.serviceIndex,
                  serviceIndices,
                ),
              )
              .run();
          }
          tx.delete(serviceVersionRepoDbConfig.schema.executedCommandOutbox)
            .where(
              inArray(
                serviceVersionRepoDbConfig.schema.executedCommandOutbox
                  .executedIndex,
                [...indices],
              ),
            )
            .run();
        });
      },
    },
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const deliveries: IExecutedCommandDelivery[] = [];
        for (const row of rows) {
          if (!('kind' in row)) {
            return yield* makeZerospinError('service-publication-invalid');
          }
          deliveries.push(row);
        }
        const chain = yield* ServiceVersionChain.getRepo({
          key: this.key,
        });
        yield* Effect.acquireUseRelease(
          makeAsync(() => chain.executedCommandSubscriber),
          receiver =>
            makeAsync(() => receiver.receive(deliveries)).pipe(
              Effect.flatMap(envelope => readRpcEnvelope(envelope)),
            ),
          receiver => Effect.sync(() => receiver[Symbol.dispose]()),
        );
      }),
  });
  get executedCommandOutbox() {
    return this.#executedCommandOutbox;
  }

  admittedCommandsFanoutSubscriber(sourceKey: {
    systemId: string;
    serviceName: string;
  }): ReturnType<
    typeof makeFanoutSubscriber<
      'admittedCommandsFanout',
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
      name: 'admittedCommandsFanout',
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
        this.#asyncOperations.afterExecution(() =>
          this.#executedCommandOutbox.drainAfter(() =>
            Effect.gen({ self: this }, function* () {
              yield* this.#execution.withPermits(1)(
                executeCommands({ db: this.db, key: this.key, rows }),
              );
            }),
          ),
        ),
    });
  }
  async execute(props: {
    serviceIndex: number;
  }): Promise<
    IRpcEnvelope<typeof ServiceTerminalCommandSchema.Type, IZerospinErrorJson>
  > {
    return config.system.runtime.runPromise(
      this.#executedCommandOutbox
        .drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            return yield* execute({
              ...props,
              db: this.db,
              key: this.key,
              subscriber: this.admittedCommandsFanoutSubscriber({
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
      Effect.gen({ self: this }, function* () {
        const chain = yield* ServiceVersionChain.getRepo({ key: this.key });
        return yield* flush({
          serviceIndex,
          repo: this,
          chain,
          executedCommandOutbox: this.#executedCommandOutbox,
          db: this.db,
          key: this.key,
        });
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
      this.#executedCommandOutbox
        .drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            yield* makeAsync(() =>
              this.admittedCommandsFanoutSubscriber({
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
      this.#executedCommandOutbox
        .drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            yield* makeAsync(() =>
              this.admittedCommandsFanoutSubscriber({
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
}
