import { makeRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import {
  makeFanoutQueue,
  type IFanoutQueue,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';
import { ServiceActorVersionRepo } from '../ServiceActorVersionRepo/ServiceActorVersionRepo.js';
import { serviceActorVersionRepoFixedDORepoConfig } from '../ServiceActorVersionRepo/serviceActorVersionRepoFixedDORepoConfig.js';

import {
  readServiceResultsPage,
  type IServiceResult,
} from './readServiceResultsPage.js';
import { receiveResults } from './receiveResults/receiveResults.js';
import type { serviceVersionChainDbConfig } from './serviceVersionChainDbConfig.js';
import { serviceVersionChainFixedDORepoConfig } from './serviceVersionChainFixedDORepoConfig.js';
type IExecutionFanout = IFanoutQueue<
  'executionResultsFanout',
  '/:systemId/:serviceName/:serviceVersion/:actorName/:actorVersion/:actorPath',
  | IServiceResult
  | typeof serviceVersionChainDbConfig.schema.commands.$inferSelect
>;

export class ServiceVersionChain extends makeFixedDORepo({
  namespaceBinding: 'SERVICE_VERSION_CHAIN',
  fixedDORepoConfig: serviceVersionChainFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    serviceVersionChainFixedDORepoConfig;
  /** Locate an own command by admission position independently of merged result order. */
  async getServiceResult(serviceIndex: number) {
    return config.system.runtime.runPromise(
      Effect.sync(() =>
        this.db
          .select()
          .from(this.schema.commands)
          .where(eq(this.schema.commands.serviceIndex, serviceIndex))
          .get(),
      ).pipe(makeRpcEnvelope),
    );
  }
  readonly #executionResultsFanout: IExecutionFanout = makeFanoutQueue({
    concurrency: 100,
    name: 'executionResultsFanout',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'executionResultsFanoutSubscribers',
    subscriberNameUtils: serviceActorVersionRepoFixedDORepoConfig.nameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'executedIndex',
    readPage: page => readServiceResultsPage({ db: this.db, ...page }),
    getRepo: ServiceActorVersionRepo.getRepo,
  });
  /*
   * Exposes the already bound executionResultsFanout capability from ServiceVersionChain.
   *
   * 1. Return the bound capability.
   */
  get executionResultsFanout(): IExecutionFanout {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executionResultsFanout;
  }

  readonly #executedCommandSubscriber = makeOutboxSubscriber({
    name: 'executedCommand',
    receive: (rows: Parameters<typeof receiveResults>[0]['rows']) =>
      Effect.gen({ self: this }, function* () {
        yield* this.alarmRegistry.hold('executionResultsFanout');
        yield* receiveResults({ rows, db: this.db, key: this.key });
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            this.#executionResultsFanout.drain();
          }),
        ),
      ),
  });
  /*
   * Exposes the already bound executedCommandSubscriber capability from ServiceVersionChain.
   *
   * 1. Return the bound capability.
   */
  get executedCommandSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executedCommandSubscriber;
  }
}
