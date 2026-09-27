import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  isZerospinError,
  makeZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq, isNotNull } from 'drizzle-orm';
import { Effect, Semaphore } from 'effect';

import { AggregateActorVersionChain } from '../AggregateActorVersionChain/AggregateActorVersionChain.js';
import { aggregateActorVersionChainDbConfig } from '../AggregateActorVersionChain/aggregateActorVersionChainDbConfig.js';
import { AggregateVersionChain } from '../AggregateVersionChain/AggregateVersionChain.js';
import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';

import { aggregateActorVersionRepoDbConfig } from './aggregateActorVersionRepoDbConfig.js';
import { aggregateActorVersionRepoFixedDORepoConfig } from './aggregateActorVersionRepoFixedDORepoConfig.js';
import { applyExecutedCommands } from './applyExecutedCommands/applyExecutedCommands.js';
import { makeActorAutomations } from './automations/makeActorAutomations.js';
import { catchup } from './catchup/catchup.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import { makeAggregateCommandsOutbox } from './optimistic/makeAggregateCommandsOutbox.js';
import { stageActorCommandsWithRetry } from './optimistic/stageActorCommands.js';
import { commandRowForSource } from './retainedCommands.js';
import { validateCommands } from './validateCommands/validateCommands.js';

export class AggregateActorVersionRepo extends makeFixedDORepo({
  namespaceBinding: 'AGGREGATE_ACTOR_VERSION_REPO',
  fixedDORepoConfig: aggregateActorVersionRepoFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    aggregateActorVersionRepoFixedDORepoConfig;

  override onDOActivation() {
    void this.#automationGroupRecovery;
    return onDOActivation({ repo: this }).pipe(
      Effect.andThen(this.#automations.initialize),
      Effect.andThen(
        this.#confirmedGroups.withPermits(1)(this.#resumeAutomationGroups),
      ),
    );
  }

  readonly #actorWrites = Effect.runSync(Semaphore.make(1));
  readonly #confirmedGroups = Effect.runSync(Semaphore.make(1));

  readonly #automations = makeActorAutomations({
    db: this.db,
    key: this.key,
    actorWrites: this.#actorWrites,
    stageOutputs: ({ commands, executedIndex }) =>
      this.#aggregateCommandsOutbox.drainAfter(() =>
        stageActorCommandsWithRetry({
          db: this.db,
          key: this.key,
          commands,
          automationExecutedIndex: executedIndex,
          actorWrites: this.#actorWrites,
        }).pipe(
          Effect.scoped,
          Effect.mapError(error =>
            isZerospinError(error)
              ? error
              : makeZerospinError({
                  code: 'actor-staging-failed',
                  cause: String(error),
                }),
          ),
        ),
      ),
  });

  readonly #resumeAutomationGroups = this.#automations.resume().pipe(
    Effect.andThen(this.alarmRegistry.release('actorAutomationGroups')),
    Effect.mapError(error =>
      isZerospinError(error)
        ? error
        : makeZerospinError({
            code: 'actor-automation-recovery-failed',
            cause: String(error),
          }),
    ),
  );

  readonly #automationGroupRecovery = this.alarmRegistry.register(
    'actorAutomationGroups',
    this.#confirmedGroups
      .withPermits(1)(this.#resumeAutomationGroups)
      .pipe(
        Effect.mapError(error =>
          isZerospinError(error)
            ? error
            : makeZerospinError({
                code: 'actor-automation-recovery-failed',
                cause: String(error),
              }),
        ),
      ),
  );

  readonly #aggregateCommandsOutbox = makeAggregateCommandsOutbox({
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
  });

  async stageCommands(props: {
    commands: readonly IEncodedCommand<IAggregateCommand>[];
    automationExecutedIndex?: number;
  }) {
    return config.system.runtime.runPromise(
      this.#aggregateCommandsOutbox
        .drainAfter(() =>
          stageActorCommandsWithRetry({
            ...props,
            db: this.db,
            key: this.key,
            actorWrites: this.#actorWrites,
          }).pipe(Effect.scoped),
        )
        .pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }

  async getStagedAdmission(props: { commandId: string }) {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        const table = aggregateActorVersionRepoDbConfig.schema.pendingCommands;
        const commandTable = aggregateActorVersionRepoDbConfig.schema.commands;
        const saved = commandRowForSource(this.db, {
          id: props.commandId,
          aggregateId: this.key.aggregateId,
          aggregateName: this.key.aggregateName,
        });
        if (saved === undefined) {
          return yield* makeZerospinError('staged-command-not-found');
        }
        const retained = this.db
          .select()
          .from(table)
          .where(eq(table.commandRowId, saved.rowId))
          .get();
        if (retained === undefined) {
          return yield* makeZerospinError('staged-command-not-found');
        }
        yield* this.#aggregateCommandsOutbox.drain(retained.stageIndex);
        const submitted = this.db
          .select()
          .from(table)
          .where(eq(table.commandRowId, saved.rowId))
          .get();
        if (submitted === undefined) {
          return yield* makeZerospinError('staged-command-not-found');
        }
        const confirmed = this.db
          .select()
          .from(commandTable)
          .where(eq(commandTable.rowId, saved.rowId))
          .get();
        if (confirmed === undefined) {
          return yield* makeZerospinError('staged-command-not-found');
        }
        const decoded =
          yield* aggregateActorVersionRepoDbConfig.tables.commands.decodeRow(
            confirmed,
          );
        if (decoded.admission?.status === 'failed') {
          return yield* makeZerospinError(decoded.admission.failure);
        }
        if (decoded.aggregateIndex === null || decoded.admission === null) {
          return yield* makeZerospinError('staged-admission-result-missing');
        }
        return {
          id: decoded.id,
          nodeIndex: decoded.nodeIndex,
          aggregateIndex: decoded.aggregateIndex,
          admission: decoded.admission,
        };
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }

  readonly #actorCommandsOutbox = makeOutboxQueue({
    indexColumnName: 'executedIndex',
    name: 'actorCommandsOutbox',
    db: this.db,
    outboxTable: aggregateActorVersionRepoDbConfig.schema.commands,
    where: isNotNull(
      aggregateActorVersionRepoDbConfig.schema.commands.executedIndex,
    ),
    alarmRegistry: this.alarmRegistry,
    retention: 'retain',
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* AggregateActorVersionChain.getRepo({
          key: this.key,
        });
        const receiver = yield* makeAsync(() => chain.actorCommandsSubscriber);
        const key = this.key;
        const output = yield* Effect.forEach(rows, stored =>
          Effect.gen(function* () {
            const row =
              yield* aggregateActorVersionRepoDbConfig.tables.commands.decodeRow(
                stored,
              );
            if (
              row.executedIndex === null ||
              row.executedHash === null ||
              row.actorAggregateIndex === null ||
              row.actorDelta === null
            ) {
              return yield* makeZerospinError('actor-output-incomplete');
            }
            const owned =
              row.nodeId !== null &&
              row.sessionName !== null &&
              row.actorName === key.actorName &&
              row.actorVersion === key.actorVersion;
            return yield* aggregateActorVersionChainDbConfig.tables.commands.encodeRow(
              {
                ...row,
                acknowledgedAt: null,
                lastDeliveryFailure: null,
                completionNodeId: owned ? row.nodeId : null,
                completionNodeIndex: owned ? row.nodeIndex : null,
                completionClaims: owned ? row.claims : null,
                completionSessionName: owned ? row.sessionName : null,
              },
            );
          }),
        ).pipe(
          Effect.mapError(error =>
            isZerospinError(error)
              ? error
              : makeZerospinError({
                  code: 'actor-output-invalid',
                  cause: String(error),
                }),
          ),
        );
        yield* makeAsync(() => receiver.receive(output)).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        );
      }),
  });
  /*
   * Exposes the already bound actorCommands capability.
   *
   * 1. Return the bound capability.
   */
  get actorCommandsOutbox() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#actorCommandsOutbox;
  }
  /*
   * Bind selected aggregate delivery and catch-up to the durable projection cursor.
   * Every receive holds the output lease before committing local replay.
   */
  executionResultsFanoutSubscriber(
    sourceKey: Parameters<typeof AggregateVersionChain.getRepo>[0]['key'],
  ): ReturnType<
    typeof makeFanoutSubscriber<
      'executionResultsFanout',
      typeof sourceKey,
      typeof this.key,
      Parameters<typeof applyExecutedCommands>[0]['rows'][number]
    >
  > {
    if (
      sourceKey.systemId !== this.key.systemId ||
      sourceKey.aggregateId !== this.key.aggregateId ||
      sourceKey.aggregateName !== this.key.aggregateName ||
      sourceKey.aggregateVersion !== this.key.aggregateVersion
    ) {
      throw makeZerospinError({
        code: 'fanout-source-key-mismatch',
        message: 'Aggregate source does not match the bound replica',
      });
    }
    return makeFanoutSubscriber({
      name: 'executionResultsFanout',
      sourceKey,
      key: this.key,
      getRepo: AggregateVersionChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(aggregateActorVersionRepoDbConfig.schema.actorState)
          .where(eq(aggregateActorVersionRepoDbConfig.schema.actorState.id, 1))
          .get()?.executedIndex ?? 0,
      receive: (
        delivery: IFanoutDelivery<
          Parameters<typeof applyExecutedCommands>[0]['rows'][number]
        >,
      ) =>
        Effect.gen({ self: this }, function* () {
          yield* this.#confirmedGroups.withPermits(1)(
            Effect.gen({ self: this }, function* () {
              yield* this.#resumeAutomationGroups;
              for (const row of delivery.rows) {
                const projectedIndex =
                  this.db
                    .select()
                    .from(aggregateActorVersionRepoDbConfig.schema.actorState)
                    .where(
                      eq(
                        aggregateActorVersionRepoDbConfig.schema.actorState.id,
                        1,
                      ),
                    )
                    .get()?.executedIndex ?? 0;
                if (row.executedIndex <= projectedIndex) continue;
                yield* this.alarmRegistry.hold('actorAutomationGroups');
                const captured = yield* this.#actorWrites.withPermits(1)(
                  this.#actorCommandsOutbox.drainAfter(() =>
                    Effect.gen({ self: this }, function* () {
                      yield* applyExecutedCommands({
                        rows: [row],
                        db: this.db,
                        key: this.key,
                      });
                      return yield* this.#automations.capture(
                        row.executedIndex,
                      );
                    }).pipe(Effect.scoped),
                  ),
                );
                yield* this.#automations.runGroup(captured);
                yield* this.alarmRegistry.release('actorAutomationGroups');
              }
            }),
          );
        }).pipe(
          Effect.mapError(error =>
            isZerospinError(error)
              ? error
              : makeZerospinError({
                  code: 'actor-automation-receive-failed',
                  cause: String(error),
                }),
          ),
        ),
    });
  }
  async getAutomationOutput(reference: {
    automationName: string;
    executedIndex: number;
  }): Promise<
    IRpcEnvelope<IEncodedCommand<IAggregateCommand>, IZerospinErrorJson>
  > {
    return config.system.runtime.runPromise(
      this.#automations.getOutput(reference).pipe(makeRpcEnvelope),
    );
  }

  /*
   * Snapshot reads catch this replica up through a bounded VAC tip, then enroll
   * at the committed projection cursor. Replay uses the live receive operation
   * and holds durable alarm leases for the outputs it creates.
   *
   * 1. Run the bound domain operation.
   */
  async catchup(props?: { throughExecutedIndex?: number }) {
    // 1 — run catchup with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      catchup({
        ...props,
        subscriber: this.executionResultsFanoutSubscriber(this.key),
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  /*
   * Session snapshots capture selected state and its cursor, publish through
   * that cursor, then reconcile requested command outcomes from ActorVAC.
   * Publication waits occur after the synchronous capture transaction completes.
   *
   * 1. Run the bound domain operation.
   */
  async getSnapshot(props: Parameters<typeof getSnapshot>[0]['requested']) {
    // 1 — run getSnapshot with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getSnapshot({
        db: this.db,
        key: this.key,
        requested: props,
        subscriber: this.executionResultsFanoutSubscriber(this.key),
        actorCommandsOutbox: this.#actorCommandsOutbox,
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  /*
   * Replica callers inspect the locally committed projection cursor.
   * This reader reports local progress; publication durability is checked separately
   * by the snapshot path.
   *
   * 1. Run the bound domain operation.
   */
  async validateCommands(
    props: Pick<Parameters<typeof validateCommands>[0], 'commands'>,
  ) {
    return config.system.runtime.runPromise(
      validateCommands({ ...props, db: this.db, key: this.key }).pipe(
        Effect.scoped,
        Effect.provide(AsyncLive),
        makeRpcEnvelope,
      ),
    );
  }

  async getProjectionReadiness() {
    // 1 — run getProjectionReadiness with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getProjectionReadiness({ db: this.db, key: this.key }).pipe(
        makeRpcEnvelope,
      ),
    );
  }
}
