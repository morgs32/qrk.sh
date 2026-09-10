import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { type AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { type IAnyErrorJson, type IEncodedResult } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, type Schema } from 'effect';

import {
  makeFanoutQueue,
  type IFanoutRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { managedRuntime } from '../managedRuntime.js';
import { VersionedAggregateRepo } from '../VersionedAggregateRepo/VersionedAggregateRepo.js';

import { admitCommands } from './admitCommands/admitCommands.js';
import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';
import { aggregateChainFixedDORepoConfig } from './aggregateChainFixedDORepoConfig.js';
import { executeAggregateCommand } from './executeAggregateCommand/executeAggregateCommand.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';

export class AggregateChain
  extends makeFixedDORepo({
    namespaceBinding: 'AGGREGATE_CHAIN',
    fixedDORepoConfig: aggregateChainFixedDORepoConfig,
  })
  implements
    IFanoutRepo<'versionedAggregateFanoutQueue', VersionedAggregateRepo>
{
  /**
   * Fanout: AggregateChain → VersionedAggregateRepo.
   *
   * WHO: versionedAggregateRepos.
   * LOG: admittedCommands (every row deliverable).
   * DELIVER: VAR subscriber.receive(delivery); acknowledgement follows its durable commit.
   * ENROLL: Activation reconciles the deployed versions without resetting progress.
   */
  readonly #versionedAggregateFanoutQueue = makeFanoutQueue({
    concurrency: 100,
    name: 'versionedAggregateFanoutQueue',
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    db: this.db,
    entriesTableName: 'admittedCommands',
    indexColumnName: 'aggregateIndex',
    subscribersTableName: 'versionedAggregateRepos',
    subscribersWhere: [
      eq(aggregateChainDbConfig.schema.versionedAggregateRepos.active, true),
    ],
    subscriberNameUtils: VersionedAggregateRepo.fixedDORepoConfig.nameUtils,
    key: this.key,
    getRepo: VersionedAggregateRepo.getRepo,
  });

  /*
   * Exposes the already bound versionedAggregateFanoutQueue capability from AggregateChain.
   */
  get versionedAggregateFanoutQueue() {
    return this.#versionedAggregateFanoutQueue;
  }

  /** Adopt bundled intent and retain recovery before this activation admits events. */
  override onDOActivation() {
    return onDOActivation({
      db: this.db,
      key: this.key,
      alarms: this.alarmRegistry,
    });
  }

  /*
   * AggregateChain durably orders complete aggregate inputs and returns
   * admission receipts. Each batch commits atomically; retries recover retained
   * receipts, while version-owned materializers perform preparation and execution.
   *
   * 1. Hold the materializer delivery alarm.
   * 2. Commit the admitted occurrences.
   * 3. Deliver through the retained alarm.
   */
  async admitCommands(
    props: Parameters<typeof admitCommands>[0] extends {
      commands: infer C;
    }
      ? { commands: C }
      : never,
  ) {
    return managedRuntime.runPromise(
      this.#versionedAggregateFanoutQueue
        .drainAfter(() =>
          admitCommands({ ...props, db: this.db, key: this.key }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  /*
   * Direct aggregate execution admits the occurrence and asks the current
   * base materializer for its terminal result. A retry selects the current base
   * again, so cutover can change which version answers it.
   *
   * 1. Hold the delivery alarm.
   * 2. Run the bound domain operation.
   * 3. Schedule downstream delivery.
   */
  async executeAggregateCommand(props: {
    aggregateVersion: string;
    command: IEncodedCommand<IAggregateCommand>;
  }): Promise<
    IEncodedResult<
      Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    // 1 — retain delivery before admitting the command
    await managedRuntime.runPromise(
      this.alarmRegistry
        .hold('versionedAggregateFanoutQueue')
        .pipe(Effect.provide(AsyncLive)),
    );

    // 2 — run executeAggregateCommand with the instance-bound dependencies and encode its RPC outcome
    const result = await managedRuntime.runPromise(
      executeAggregateCommand({ ...props, db: this.db, key: this.key }).pipe(
        // 3 — wake from the persisted tip, including prior work after admission failure
        Effect.ensuring(
          Effect.sync(() => {
            this.#versionedAggregateFanoutQueue.drain();
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
    return result;
  }
}
