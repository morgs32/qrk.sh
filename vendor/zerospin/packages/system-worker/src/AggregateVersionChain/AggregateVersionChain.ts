import { makeRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { AggregateActorVersionRepo } from '../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { aggregateActorVersionRepoFixedDORepoConfig } from '../AggregateActorVersionRepo/aggregateActorVersionRepoFixedDORepoConfig.js';
import {
  aggregateMachineNameUtils,
  getAggregateMachineRepo,
} from '../machineRepoNames.js';
import { makeFanoutQueue } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';
import { readExecutedCommandsPage } from '../readExecutedCommandsPage/readExecutedCommandsPage.js';

import { aggregateVersionChainFixedDORepoConfig } from './aggregateVersionChainFixedDORepoConfig.js';
import { receiveExecutedCommands } from './receiveExecutedCommands/receiveExecutedCommands.js';
import type { IExecutedCommandRow } from './types.js';
export class AggregateVersionChain extends makeFixedDORepo({
  namespaceBinding: 'AGGREGATE_VERSION_CHAIN',
  fixedDORepoConfig: aggregateVersionChainFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    aggregateVersionChainFixedDORepoConfig;
  /** Locate an aggregate result independently of materialization pagination. */
  async getAggregateResult(aggregateIndex: number) {
    return config.system.runtime.runPromise(
      Effect.sync(() =>
        this.db
          .select()
          .from(this.schema.aggregateCommands)
          .where(
            eq(this.schema.aggregateCommands.aggregateIndex, aggregateIndex),
          )
          .get(),
      ).pipe(makeRpcEnvelope),
    );
  }
  readonly #executionResultsFanout = makeFanoutQueue({
    concurrency: 100,
    name: 'executionResultsFanout',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'executedCommandsFanoutSubscribers',
    subscriberNameUtils: aggregateActorVersionRepoFixedDORepoConfig.nameUtils,
    entriesTableName: 'aggregateCommands',
    indexColumnName: 'executedIndex',
    readPage: (
      page,
    ): {
      rows: readonly { row: IExecutedCommandRow; index: number }[];
      lastIndex: number;
    } =>
      readExecutedCommandsPage({
        db: this.db,
        aggregateCommands: this.schema.aggregateCommands,
        serviceCommands: this.schema.serviceCommands,
        ...page,
      }),
    getRepo: AggregateActorVersionRepo.getRepo,
  });
  /*
   * Exposes the already bound executionResultsFanout capability from AggregateVersionChain.
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
    subscriberNameUtils: aggregateMachineNameUtils,
    entriesTableName: 'aggregateCommands',
    indexColumnName: 'executedIndex',
    readPage: (
      page,
    ): {
      rows: readonly { row: IExecutedCommandRow; index: number }[];
      lastIndex: number;
    } =>
      readExecutedCommandsPage({
        db: this.db,
        aggregateCommands: this.schema.aggregateCommands,
        serviceCommands: this.schema.serviceCommands,
        ...page,
      }),
    getRepo: getAggregateMachineRepo,
  });
  get machineResultsFanout() {
    return this.#machineResultsFanout;
  }
  readonly #executedCommandsSubscriber = makeOutboxSubscriber({
    name: 'executedCommands',
    receive: (rows: Parameters<typeof receiveExecutedCommands>[0]['rows']) =>
      Effect.gen({ self: this }, function* () {
        yield* this.alarmRegistry.hold('machineResultsFanout');
        return yield* this.#executionResultsFanout.drainAfter(() =>
          receiveExecutedCommands({ rows, db: this.db, key: this.key }),
        );
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            this.#machineResultsFanout.drain();
          }),
        ),
      ),
  });
  /*
   * Exposes the already bound executedCommandsSubscriber capability from AggregateVersionChain.
   *
   * 1. Return the bound capability.
   */
  get executedCommandsSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executedCommandsSubscriber;
  }
}
