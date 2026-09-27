import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { AggregateExecutedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, type IZerospinErrorJson } from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { AggregateActorVersionRepo } from '../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { AggregateVersionRepo } from '../AggregateVersionRepo/AggregateVersionRepo.js';
import {
  makeFanoutQueue,
  type IFanoutRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';

import {
  prepareAdmission,
  type admitCommands,
} from './admitCommands/admitCommands.js';
import { admitCommandsTx } from './admitCommands/admitCommandsTx.js';
import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';
import { aggregateChainFixedDORepoConfig } from './aggregateChainFixedDORepoConfig.js';
import { executeAggregateCommand } from './executeAggregateCommand/executeAggregateCommand.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';

export class AggregateChain
  extends makeFixedDORepo({
    namespaceBinding: 'AGGREGATE_CHAIN',
    fixedDORepoConfig: aggregateChainFixedDORepoConfig,
  })
  implements IFanoutRepo<'admissionResultsFanout', AggregateVersionRepo>
{
  /**
   * Fanout: AggregateChain → AggregateVersionRepo.
   *
   * WHO: aggregateVersionRepos.
   * LOG: commands (every row deliverable).
   * DELIVER: VAR subscriber.receive(delivery); acknowledgement follows its durable commit.
   * ENROLL: Activation reconciles the deployed versions without resetting progress.
   */
  readonly #admissionResultsFanout = makeFanoutQueue({
    concurrency: 100,
    name: 'admissionResultsFanout',
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    db: this.db,
    entriesTableName: 'commands',
    indexColumnName: 'aggregateIndex',
    subscribersTableName: 'aggregateVersionRepos',
    subscribersWhere: [
      eq(aggregateChainDbConfig.schema.aggregateVersionRepos.active, true),
    ],
    subscriberNameUtils: AggregateVersionRepo.fixedDORepoConfig.nameUtils,
    key: this.key,
    getRepo: AggregateVersionRepo.getRepo,
  });

  /*
   * Exposes the already bound admissionResultsFanout capability from AggregateChain.
   */
  get admissionResultsFanout() {
    return this.#admissionResultsFanout;
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
    return config.system.runtime.runPromise(
      prepareAdmission({ ...props, db: this.db, key: this.key }).pipe(
        Effect.flatMap(prepared =>
          this.#admissionResultsFanout.drainAfter(() =>
            admitCommandsTx(this.db, prepared),
          ),
        ),
        Effect.provide(AsyncLive),
        makeRpcEnvelope,
      ),
    );
  }

  /** Internal DO capability: recover the output from its owning actor, never trust submitted bytes. */
  async executeAutomationCommand(props: {
    aggregateVersion: string;
    actorName: string;
    actorVersion: string;
    actorPath: string;
    automationName: string;
    executedIndex: number;
  }): Promise<
    IRpcEnvelope<
      typeof AggregateExecutedCommandSchema.Type & { executedIndex: number },
      IZerospinErrorJson
    >
  > {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        const repo = yield* AggregateActorVersionRepo.getRepo({
          key: {
            ...this.key,
            aggregateVersion: props.aggregateVersion,
            actorName: props.actorName,
            actorVersion: props.actorVersion,
            actorPath: props.actorPath,
          },
        });
        const command = yield* makeAsync<
          Awaited<ReturnType<AggregateActorVersionRepo['getAutomationOutput']>>
        >(() =>
          repo.getAutomationOutput({
            automationName: props.automationName,
            executedIndex: props.executedIndex,
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        if (command.automationName !== props.automationName) {
          return yield* makeZerospinError('automation-output-invalid');
        }
        yield* this.alarmRegistry.hold('admissionResultsFanout');
        return yield* executeAggregateCommand({
          aggregateVersion: props.aggregateVersion,
          command,
          automationOutput: true,
          db: this.db,
          key: this.key,
        });
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
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
  }) {
    // 1 — retain delivery before admitting the command
    await config.system.runtime.runPromise(
      this.alarmRegistry
        .hold('admissionResultsFanout')
        .pipe(Effect.provide(AsyncLive)),
    );

    // 2 — run executeAggregateCommand with the instance-bound dependencies and encode its RPC outcome
    const result = await config.system.runtime.runPromise(
      executeAggregateCommand({ ...props, db: this.db, key: this.key }).pipe(
        // 3 — wake from the persisted tip, including prior work after admission failure
        Effect.ensuring(
          Effect.sync(() => {
            this.#admissionResultsFanout.drain();
          }),
        ),
        Effect.provide(AsyncLive),
        makeRpcEnvelope,
      ),
    );
    return result;
  }
}
