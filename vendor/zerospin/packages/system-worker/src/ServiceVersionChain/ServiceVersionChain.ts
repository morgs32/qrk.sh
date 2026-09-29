import { Effect } from 'effect';

import { AggregateVersionRepo } from '../AggregateVersionRepo/AggregateVersionRepo.js';
import { makeFanoutQueue } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';
import { getServiceMachineRepo, serviceMachineNameUtils } from '../machineRepoNames.js';
import { ServiceActorVersionRepo } from '../ServiceActorVersionRepo/ServiceActorVersionRepo.js';
import { serviceActorVersionRepoFixedDORepoConfig } from '../ServiceActorVersionRepo/serviceActorVersionRepoFixedDORepoConfig.js';

import { receiveResults } from './receiveResults/receiveResults.js';
import { serviceVersionChainFixedDORepoConfig } from './serviceVersionChainFixedDORepoConfig.js';
export class ServiceVersionChain extends makeFixedDORepo({
  namespaceBinding: 'SERVICE_VERSION_CHAIN',
  fixedDORepoConfig: serviceVersionChainFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    serviceVersionChainFixedDORepoConfig;
  readonly #executionResultsFanout = makeFanoutQueue({
    concurrency: 100,
    name: 'executionResultsFanout',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'executedCommandsFanoutSubscribers',
    subscriberNameUtils: serviceActorVersionRepoFixedDORepoConfig.nameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'serviceIndex',
    getRepo: ServiceActorVersionRepo.getRepo,
  });
  /*
   * Exposes the already bound executionResultsFanout capability from ServiceVersionChain.
   *
   * 1. Return the bound capability.
   */
  get executionResultsFanout() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executionResultsFanout;
  }
  readonly #machineResultsFanout = makeFanoutQueue({
    concurrency: 100,
    name: 'machineResultsFanout',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'machineResultsSubscribers',
    subscriberNameUtils: serviceMachineNameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'serviceIndex',
    getRepo: getServiceMachineRepo,
  });
  get machineResultsFanout() {
    return this.#machineResultsFanout;
  }
  readonly #serviceResultsToAggregatesFanout = makeFanoutQueue({
    concurrency: 100,
    name: 'serviceResultsToAggregatesFanout',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'aggregateSubscribers',
    subscriberNameUtils: AggregateVersionRepo.fixedDORepoConfig.nameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'serviceIndex',
    getRepo: AggregateVersionRepo.getRepo,
  });
  get serviceResultsToAggregatesFanout() {
    return this.#serviceResultsToAggregatesFanout;
  }
  readonly #resultsSubscriber = makeOutboxSubscriber({
    name: 'results',
    receive: (rows: Parameters<typeof receiveResults>[0]['rows']) =>
      Effect.gen({ self: this }, function* () {
        yield* this.alarmRegistry.hold('executionResultsFanout');
        yield* this.alarmRegistry.hold('machineResultsFanout');
        yield* this.alarmRegistry.hold('serviceResultsToAggregatesFanout');
        yield* receiveResults({ rows, db: this.db, key: this.key });
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            this.#executionResultsFanout.drain();
            this.#machineResultsFanout.drain();
            this.#serviceResultsToAggregatesFanout.drain();
          }),
        ),
      ),
  });
  /*
   * Exposes the already bound resultsSubscriber capability from ServiceVersionChain.
   *
   * 1. Return the bound capability.
   */
  get resultsSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#resultsSubscriber;
  }
}
