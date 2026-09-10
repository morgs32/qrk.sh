import { Effect } from 'effect';

import { FrontendVersionedServiceRepo } from '../FrontendVersionedServiceRepo/FrontendVersionedServiceRepo.js';
import { frontendVersionedServiceRepoFixedDORepoConfig } from '../FrontendVersionedServiceRepo/frontendVersionedServiceRepoFixedDORepoConfig.js';
import { makeFanoutQueue } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';
import { UserVersionedAggregateRepo } from '../UserVersionedAggregateRepo/UserVersionedAggregateRepo.js';
import { userVersionedAggregateRepoFixedDORepoConfig } from '../UserVersionedAggregateRepo/userVersionedAggregateRepoFixedDORepoConfig.js';
import { VersionedAggregateRepo } from '../VersionedAggregateRepo/VersionedAggregateRepo.js';

import { receiveResults } from './receiveResults/receiveResults.js';
import { versionedServiceChainFixedDORepoConfig } from './versionedServiceChainFixedDORepoConfig.js';
export class VersionedServiceChain extends makeFixedDORepo({
  namespaceBinding: 'VERSIONED_SERVICE_CHAIN',
  fixedDORepoConfig: versionedServiceChainFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    versionedServiceChainFixedDORepoConfig;
  readonly #replicaFanoutQueue = makeFanoutQueue({
    concurrency: 100,
    name: 'replicaFanoutQueue',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'replicaSubscribers',
    subscriberNameUtils:
      frontendVersionedServiceRepoFixedDORepoConfig.nameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'outboxIndex',
    getRepo: FrontendVersionedServiceRepo.getRepo,
  });
  /*
   * Exposes the already bound replicaFanoutQueue capability from VersionedServiceChain.
   *
   * 1. Return the bound capability.
   */
  get replicaFanoutQueue() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#replicaFanoutQueue;
  }
  readonly #aggregateFanoutQueue = makeFanoutQueue({
    concurrency: 100,
    name: 'aggregateFanoutQueue',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'aggregateSubscribers',
    subscriberNameUtils: VersionedAggregateRepo.fixedDORepoConfig.nameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'outboxIndex',
    getRepo: VersionedAggregateRepo.getRepo,
  });
  get aggregateFanoutQueue() {
    return this.#aggregateFanoutQueue;
  }
  readonly #aggregateReplicaFanoutQueue = makeFanoutQueue({
    concurrency: 100,
    name: 'aggregateReplicaFanoutQueue',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'aggregateReplicaSubscribers',
    subscriberNameUtils: userVersionedAggregateRepoFixedDORepoConfig.nameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'outboxIndex',
    getRepo: UserVersionedAggregateRepo.getRepo,
  });
  get aggregateReplicaFanoutQueue() {
    return this.#aggregateReplicaFanoutQueue;
  }
  readonly #resultsSubscriber = makeOutboxSubscriber({
    name: 'results',
    receive: (rows: Parameters<typeof receiveResults>[0]['rows']) =>
      Effect.gen({ self: this }, function* () {
        yield* this.alarmRegistry.hold('replicaFanoutQueue');
        yield* this.alarmRegistry.hold('aggregateFanoutQueue');
        yield* this.alarmRegistry.hold('aggregateReplicaFanoutQueue');
        yield* receiveResults({ rows, db: this.db, key: this.key });
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            this.#replicaFanoutQueue.drain();
            this.#aggregateFanoutQueue.drain();
            this.#aggregateReplicaFanoutQueue.drain();
          }),
        ),
      ),
  });
  /*
   * Exposes the already bound resultsSubscriber capability from VersionedServiceChain.
   *
   * 1. Return the bound capability.
   */
  get resultsSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#resultsSubscriber;
  }
}
