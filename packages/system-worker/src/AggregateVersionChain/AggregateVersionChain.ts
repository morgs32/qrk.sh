import type { Async } from '@zerospin/core/async/Async';
import { type IAnyError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { desc, eq, lte } from 'drizzle-orm';
import { Effect } from 'effect';

import { AggregateActorVersionRepo } from '../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { aggregateActorVersionRepoFixedDORepoConfig } from '../AggregateActorVersionRepo/aggregateActorVersionRepoFixedDORepoConfig.js';
import { genesisDispositionHash } from '../aggregateDispositionHash/aggregateDispositionHash.js';
import {
  makeFanoutQueue,
  type IFanoutQueue,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';

import { aggregateVersionChainFixedDORepoConfig } from './aggregateVersionChainFixedDORepoConfig.js';
import { readAggregateActorResultsPage } from './readAggregateActorResultsPage.js';
import { receiveExecutedCommands } from './receiveExecutedCommands/receiveExecutedCommands.js';
import type { IExecutedCommandRow } from './types.js';
type IExecutionFanout = IFanoutQueue<
  'executionResultsFanout',
  '/:systemId/:aggregateId/:aggregateName/:aggregateVersion/:actorName/:actorVersion/:actorPath',
  IExecutedCommandRow
>;

export class AggregateVersionChain extends makeFixedDORepo({
  namespaceBinding: 'AGGREGATE_VERSION_CHAIN',
  fixedDORepoConfig: aggregateVersionChainFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    aggregateVersionChainFixedDORepoConfig;
  async getInputCheckpoint(aggregateIndex: number) {
    return config.system.runtime.runPromise(
      Effect.sync(() => {
        const command = this.db
          .select()
          .from(this.schema.aggregateCommands)
          .where(
            eq(this.schema.aggregateCommands.aggregateIndex, aggregateIndex),
          )
          .get();
        if (command === undefined) {
          return null;
        }
        const previous =
          command ??
          this.db
            .select()
            .from(this.schema.aggregateCommands)
            .where(
              lte(this.schema.aggregateCommands.aggregateIndex, aggregateIndex),
            )
            .orderBy(desc(this.schema.aggregateCommands.aggregateIndex))
            .limit(1)
            .get();
        return {
          aggregateIndex,
          commandId: command?.id ?? null,
          dispositionHash:
            previous?.dispositionHash ?? genesisDispositionHash(),
        };
      }).pipe(makeRpcEnvelope),
    );
  }
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
  readonly #executionResultsFanout: IExecutionFanout = makeFanoutQueue({
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
      rows: readonly {
        row: IExecutedCommandRow;
        index: number;
      }[];
      lastIndex: number;
    } => readAggregateActorResultsPage({ db: this.db, ...page }),
    getRepo: AggregateActorVersionRepo.getRepo,
  });
  /*
   * Exposes the already bound executionResultsFanout capability from AggregateVersionChain.
   *
   * 1. Return the bound capability.
   */
  get executionResultsFanout(): IExecutionFanout {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executionResultsFanout;
  }

  readonly #executedCommandSubscriber = makeOutboxSubscriber({
    name: 'executedCommand',
    receive: (
      rows: Parameters<typeof receiveExecutedCommands>[0]['rows'],
    ): Effect.Effect<void, IAnyError, Async> =>
      this.#executionResultsFanout.drainAfter(() =>
        receiveExecutedCommands({ rows, db: this.db, key: this.key }),
      ),
  });
  /*
   * Exposes the already bound executedCommandSubscriber capability from AggregateVersionChain.
   *
   * 1. Return the bound capability.
   */
  get executedCommandSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executedCommandSubscriber;
  }
}
