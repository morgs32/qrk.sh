import { makeFanoutQueue } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';
import { UserVersionedAggregateRepo } from '../UserVersionedAggregateRepo/UserVersionedAggregateRepo.js';
import { userVersionedAggregateRepoFixedDORepoConfig } from '../UserVersionedAggregateRepo/userVersionedAggregateRepoFixedDORepoConfig.js';

import { receiveExecutedCommands } from './receiveExecutedCommands/receiveExecutedCommands.js';
import { versionedAggregateChainFixedDORepoConfig } from './versionedAggregateChainFixedDORepoConfig.js';
export class VersionedAggregateChain extends makeFixedDORepo({
  namespaceBinding: 'VERSIONED_AGGREGATE_CHAIN',
  fixedDORepoConfig: versionedAggregateChainFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    versionedAggregateChainFixedDORepoConfig;
  readonly #replicaFanoutQueue = makeFanoutQueue({
    concurrency: 100,
    name: 'replicaFanoutQueue',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'replicaSubscribers',
    subscriberNameUtils: userVersionedAggregateRepoFixedDORepoConfig.nameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'outboxIndex',
    getRepo: UserVersionedAggregateRepo.getRepo,
  });
  /*
   * Exposes the already bound replicaFanoutQueue capability from VersionedAggregateChain.
   *
   * 1. Return the bound capability.
   */
  get replicaFanoutQueue() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#replicaFanoutQueue;
  }
  readonly #executedCommandsSubscriber = makeOutboxSubscriber({
    name: 'executedCommands',
    receive: (rows: Parameters<typeof receiveExecutedCommands>[0]['rows']) =>
      this.#replicaFanoutQueue.drainAfter(() =>
        receiveExecutedCommands({ rows, db: this.db, key: this.key }),
      ),
  });
  /*
   * Exposes the already bound executedCommandsSubscriber capability from VersionedAggregateChain.
   *
   * 1. Return the bound capability.
   */
  get executedCommandsSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executedCommandsSubscriber;
  }
}
