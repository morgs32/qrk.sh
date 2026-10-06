import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAsyncCommand } from '@zerospin/core/contracts/AsyncCommandSchema';
import type { AggregateTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { AggregateVersionRepo } from '../AggregateVersionRepo/AggregateVersionRepo.js';
import { verifyPreparedAsyncCommand } from '../asyncOperations/readPreparedAsyncCommand.js';
import {
  makeFanoutQueue,
  type IFanoutRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';

import {
  prepareAdmission,
  type admitCommands,
} from './admitCommands/admitCommands.js';
import { admitCommandsTx } from './admitCommands/admitCommandsTx.js';
import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';
import { aggregateChainFixedDORepoConfig } from './aggregateChainFixedDORepoConfig.js';
import { executeAggregateCommand } from './executeAggregateCommand/executeAggregateCommand.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import { readInputsPage } from './readInputsPage/readInputsPage.js';
import { receiveExecutedAggregateCommands } from './receiveExecutedAggregateCommands/receiveExecutedAggregateCommands.js';

export class AggregateChain
  extends makeFixedDORepo({
    namespaceBinding: 'AGGREGATE_CHAIN',
    fixedDORepoConfig: aggregateChainFixedDORepoConfig,
  })
  implements IFanoutRepo<'admittedCommandsFanout', AggregateVersionRepo>
{
  readonly #executedAggregateCommandSubscriber = makeOutboxSubscriber({
    name: 'executedAggregateCommand',
    receive: (
      rows: Parameters<typeof receiveExecutedAggregateCommands>[1],
    ): Effect.Effect<void, IAnyError, Async> =>
      this.#admittedCommandsFanout.drainAfter(() =>
        receiveExecutedAggregateCommands(this.db, rows),
      ),
  });
  get executedAggregateCommandSubscriber() {
    return this.#executedAggregateCommandSubscriber;
  }

  /**
   * Fanout: AggregateChain → AggregateVersionRepo.
   *
   * WHO: aggregateVersionRepos.
   * LOG: shared entries, with version-specific original/replay readiness.
   * DELIVER: VAR subscriber.receive(delivery); acknowledgement follows its durable commit.
   * ENROLL: Activation reconciles the deployed versions without resetting progress.
   */
  readonly #admittedCommandsFanout = makeFanoutQueue({
    concurrency: 100,
    name: 'admittedCommandsFanout',
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    db: this.db,
    entriesTableName: 'commands',
    indexColumnName: 'aggregateIndex',
    subscriberScoped: true,
    readPage: page => readInputsPage({ db: this.db, ...page }),
    subscribersTableName: 'aggregateVersionRepos',
    subscribersWhere: [
      eq(aggregateChainDbConfig.schema.aggregateVersionRepos.active, true),
    ],
    subscriberNameUtils: AggregateVersionRepo.fixedDORepoConfig.nameUtils,
    key: this.key,
    getRepo: AggregateVersionRepo.getRepo,
  });

  /*
   * Exposes the already bound admittedCommandsFanout capability from AggregateChain.
   */
  get admittedCommandsFanout() {
    return this.#admittedCommandsFanout;
  }

  /** Adopt bundled intent and retain recovery before this activation admits events. */

  override onDOActivation() {
    return onDOActivation({
      db: this.db,
      key: this.key,
      alarms: this.alarmRegistry,
    });
  }
  async admitAsyncCommand(props: {
    ownerVersion: string;
    command: IAsyncCommand;
  }) {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        const repo = yield* AggregateVersionRepo.getRepo({
          key: {
            systemId: this.key.systemId,
            aggregateName: this.key.aggregateName,
            aggregateVersion: props.ownerVersion,
            aggregateId: this.key.aggregateId,
          },
        });
        const expected = yield* makeAsync<
          Awaited<ReturnType<AggregateVersionRepo['getPreparedAsyncCommand']>>
        >(() =>
          repo.getPreparedAsyncCommand({ commandId: props.command.id }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        const command = yield* verifyPreparedAsyncCommand(
          expected,
          props.command,
        );
        const prepared = yield* prepareAdmission({
          commands: [command],
          aggregateVersion: props.ownerVersion,
          trustedAsync: true,
          db: this.db,
          key: this.key,
        });
        const retained = yield* this.#admittedCommandsFanout.drainAfter(() =>
          admitCommandsTx(this.db, prepared),
        );
        return retained[0];
      }).pipe(
        Effect.mapError(error =>
          makeZerospinError({
            code: 'async-admission-failed',
            cause: String(error),
          }),
        ),
        Effect.provide(AsyncLive),
        makeRpcEnvelope,
      ),
    );
  }

  /*
   * AggregateChain durably orders complete aggregate inputs and returns
   * the retained commands. Each batch commits atomically; a repeated id
   * returns the command already stored, while version-owned materializers
   * perform preparation and execution.
   *
   * 1. Hold the materializer delivery alarm.
   * 2. Commit the admitted occurrences.
   * 3. Start delivery after admission; the retained alarm recovers interruption.
   */
  async admitCommands(
    props: Parameters<typeof admitCommands>[0] extends {
      commands: infer C;
    }
      ? { commands: C; aggregateVersion: string }
      : never,
  ) {
    const result = await config.system.runtime.runPromise(
      prepareAdmission({ ...props, db: this.db, key: this.key }).pipe(
        Effect.flatMap(prepared =>
          this.#admittedCommandsFanout.drainAfter(() =>
            admitCommandsTx(this.db, prepared),
          ),
        ),
        Effect.provide(AsyncLive),
        makeRpcEnvelope,
      ),
    );
    return result;
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
    IRpcEnvelope<
      typeof AggregateTerminalCommandSchema.Type & { executedIndex: number },
      IZerospinErrorJson
    >
  > {
    // 1 — retain delivery before admitting the command
    await config.system.runtime.runPromise(
      this.alarmRegistry
        .hold('admittedCommandsFanout')
        .pipe(Effect.provide(AsyncLive)),
    );

    // 2 — run executeAggregateCommand with the instance-bound dependencies and encode its RPC outcome
    const result = await config.system.runtime.runPromise(
      executeAggregateCommand({ ...props, db: this.db, key: this.key }).pipe(
        // 3 — wake from the persisted tip, including prior work after admission failure
        Effect.ensuring(
          Effect.sync(() => {
            this.#admittedCommandsFanout.drain();
          }),
        ),
        Effect.provide(AsyncLive),
        makeRpcEnvelope,
      ),
    );
    return result;
  }
}
