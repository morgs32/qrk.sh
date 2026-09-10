import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Semaphore, type Schema } from 'effect';

import type {
  IFanoutDelivery,
  IFanoutSubscriberRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { ServiceAdmittedChain } from '../ServiceAdmittedChain/ServiceAdmittedChain.js';
import type { serviceAdmittedChainDbConfig } from '../ServiceAdmittedChain/serviceAdmittedChainDbConfig.js';
import { VersionedServiceChain } from '../VersionedServiceChain/VersionedServiceChain.js';

import { authorizeServiceFrontend } from './authorizeServiceFrontend/authorizeServiceFrontend.js';
import { execute } from './execute/execute.js';
import { executeCommands } from './executeCommands/executeCommands.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { flush } from './flush/flush.js';
import { getReplicatedResources } from './getReplicatedResources/getReplicatedResources.js';
import { getServiceFrontendSnapshot } from './getServiceFrontendSnapshot/getServiceFrontendSnapshot.js';
import { versionedServiceRepoDbConfig } from './versionedServiceRepoDbConfig.js';
import { versionedServiceRepoFixedDORepoConfig } from './versionedServiceRepoFixedDORepoConfig.js';
export class VersionedServiceRepo
  extends makeFixedDORepo({
    namespaceBinding: 'VERSIONED_SERVICE_REPO',
    fixedDORepoConfig: versionedServiceRepoFixedDORepoConfig,
  })
  implements IFanoutSubscriberRepo<{ name: 'serviceFanoutQueue' }>
{
  static override readonly fixedDORepoConfig =
    versionedServiceRepoFixedDORepoConfig;

  readonly #execution = Semaphore.makeUnsafe(1);
  readonly #results = makeOutboxQueue({
    name: 'results',
    db: this.db,
    outboxTable: versionedServiceRepoDbConfig.schema.results,
    alarmRegistry: this.alarmRegistry,
    retention: 'delete',
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* VersionedServiceChain.getRepo({
          key: this.key,
        });
        const receiver = yield* makeAsync(() => chain.resultsSubscriber);
        yield* makeAsync(() => receiver.receive(rows)).pipe(
          Effect.flatMap(decodeRpc),
        );
      }),
  });
  get results() {
    return this.#results;
  }
  serviceFanoutQueueSubscriber(sourceKey: {
    systemId: string;
    serviceName: string;
  }): ReturnType<
    typeof makeFanoutSubscriber<
      'serviceFanoutQueue',
      typeof sourceKey,
      typeof this.key,
      typeof serviceAdmittedChainDbConfig.schema.commands.$inferSelect
    >
  > {
    if (
      sourceKey.systemId !== this.key.systemId ||
      sourceKey.serviceName !== this.key.serviceName
    ) {
      throw new ZerospinError({
        code: 'service-fanout-source-invalid',
        message: 'Service fanout source must match the materializer owner',
      });
    }
    return makeFanoutSubscriber({
      name: 'serviceFanoutQueue',
      sourceKey,
      key: this.key,
      getRepo: ServiceAdmittedChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(versionedServiceRepoDbConfig.schema.head)
          .where(eq(versionedServiceRepoDbConfig.schema.head.singletonId, 1))
          .get()?.serviceIndex ?? 0,
      receive: ({
        rows,
      }: IFanoutDelivery<
        Parameters<typeof executeCommands>[0]['rows'][number]
      >) =>
        Effect.gen({ self: this }, function* () {
          yield* this.alarmRegistry.hold('results');
          yield* this.#execution.withPermits(1)(
            executeCommands({ db: this.db, key: this.key, rows }),
          );
        }).pipe(
          Effect.onExit(() =>
            Effect.sync(() =>
              this.ctx.waitUntil(
                managedRuntime
                  .runPromise(
                    this.#results.drain().pipe(Effect.provide(AsyncLive)),
                  )
                  .catch(() => undefined),
              ),
            ),
          ),
        ),
    });
  }
  async execute(props: {
    serviceIndex: number;
  }): Promise<
    IEncodedResult<
      Schema.Schema.Type<typeof ServiceChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.alarmRegistry.hold('results');
        return yield* execute({
          ...props,
          db: this.db,
          key: this.key,
          subscriber: this.serviceFanoutQueueSubscriber({
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
          }),
        });
      }).pipe(
        Effect.onExit(() =>
          Effect.sync(() =>
            this.ctx.waitUntil(
              managedRuntime
                .runPromise(
                  this.#results.drain().pipe(Effect.provide(AsyncLive)),
                )
                .catch(() => undefined),
            ),
          ),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }
  async flush(serviceIndex: number): Promise<
    IEncodedResult<
      {
        serviceIndex: number;
        commandId: string | null;
        dispositionHash: string | null;
      },
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      flush({
        serviceIndex,
        repo: this,
        results: this.#results,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
  async executeServiceQuery(
    props: Omit<
      Parameters<typeof executeServiceQuery>[0],
      'db' | 'serviceVersion'
    >,
  ) {
    return managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.alarmRegistry.hold('results');
        yield* makeAsync(() =>
          this.serviceFanoutQueueSubscriber({
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
          }).catchup(),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* this.#execution.withPermits(1)(
          executeServiceQuery({
            ...props,
            serviceName: this.key.serviceName,
            serviceVersion: this.key.serviceVersion,
            db: this.db,
          }),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
  async authorizeServiceFrontend(
    props: Omit<
      Parameters<typeof authorizeServiceFrontend>[0],
      'db' | 'serviceVersion'
    >,
  ) {
    return managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.alarmRegistry.hold('results');
        yield* makeAsync(() =>
          this.serviceFanoutQueueSubscriber({
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
          }).catchup(),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* this.#execution.withPermits(1)(
          authorizeServiceFrontend({
            ...props,
            serviceName: this.key.serviceName,
            serviceVersion: this.key.serviceVersion,
            db: this.db,
          }),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
  async getReplicatedResources(
    props: Omit<
      Parameters<typeof getReplicatedResources>[0],
      'db' | 'serviceVersion' | 'serviceName'
    >,
  ) {
    return managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.alarmRegistry.hold('results');
        yield* makeAsync(() =>
          this.serviceFanoutQueueSubscriber({
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
          }).catchup(),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* this.#execution.withPermits(1)(
          getReplicatedResources({
            ...props,
            serviceName: this.key.serviceName,
            serviceVersion: this.key.serviceVersion,
            db: this.db,
          }),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
  async getServiceFrontendSnapshot(
    props: Omit<
      Parameters<typeof getServiceFrontendSnapshot>[0],
      'db' | 'serviceVersion'
    >,
  ) {
    return managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.alarmRegistry.hold('results');
        yield* makeAsync(() =>
          this.serviceFanoutQueueSubscriber({
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
          }).catchup(),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* this.#execution.withPermits(1)(
          getServiceFrontendSnapshot({
            ...props,
            serviceName: this.key.serviceName,
            serviceVersion: this.key.serviceVersion,
            db: this.db,
          }),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
}
