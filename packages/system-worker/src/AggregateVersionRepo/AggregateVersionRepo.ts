import { RoutePattern } from '@remix-run/route-pattern';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IEncodedQuery } from '@zerospin/core/system/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq, inArray, lte } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { Effect, Semaphore } from 'effect';

import { AggregateChain } from '../AggregateChain/AggregateChain.js';
import type { aggregateChainDbConfig } from '../AggregateChain/aggregateChainDbConfig.js';
import type { IChainInput } from '../AggregateChain/readInputsPage/readInputsPage.js';
import { AggregateVersionChain } from '../AggregateVersionChain/AggregateVersionChain.js';
import { asyncOperationsDbConfig } from '../asyncOperations/asyncOperationsDbConfig.js';
import { makeAsyncOperations } from '../asyncOperations/makeAsyncOperations.js';
import { readAggregateVersionRepoOutput } from '../asyncOperations/readOperationOutput.js';
import {
  makePreparedAggregateCommand,
  readPreparedAggregateAsyncWork,
  resolveWorkContract,
} from '../asyncOperations/readPreparedAsyncCommand.js';
import type {
  IFanoutDelivery,
  IFanoutSubscriberRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';
import { readOwnerResultsPage } from '../readOwnerResultsPage/readOwnerResultsPage.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { aggregateVersionRepoDbConfig } from './aggregateVersionRepoDbConfig.js';
import { authorizeAggregateSession } from './authorizeAggregateSession/authorizeAggregateSession.js';
import { deleteDeliveredAggregateMaterial } from './deleteDeliveredAggregateMaterial.js';
import { execute } from './execute/execute.js';
import { executeCommands } from './executeCommands/executeCommands.js';
import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { flush } from './flush/flush.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import type {
  IExecutedCommandDelivery,
  IExecutedCommandOutboxRow,
} from './types.js';
const { system } = config;
const aggregateVersionRepoFixedDORepoConfig = makeFixedDORepoConfig({
  repoType: 'AggregateVersionRepo',
  abbreviation: systemWorkerAbbreviations.aggregateVersionRepo,
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion',
  ),
  managedRuntime: config.system.runtime,
  /*
   * 1. Resolve the authored aggregate by DO name key.
   * 2. Select the listed aggregateVersion definition.
   * 3. Build the fixed DB config from that version's models.
   */
  dbConfig: Effect.fn('AggregateVersionRepo.dbConfig')(function* ({ key }) {
    // 1 — system.aggregates[key.aggregateName] or throw
    const latestAggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    // 2 — select the listed version; fail if it is unsupported
    const aggregate = yield* getByKeyOrThrow({
      record: latestAggregate,
      key: key.aggregateVersion,
      recordKind: 'listed versions',
    });
    // 3 — combine the selected models with the Repo-owned metadata tables
    return makeResourceDbConfig({
      otherTables: aggregateVersionRepoDbConfig.tables,
      models: aggregate.models,
    });
  }),
});
export class AggregateVersionRepo
  extends makeFixedDORepo({
    namespaceBinding: 'AGGREGATE_VERSION_REPO',
    fixedDORepoConfig: aggregateVersionRepoFixedDORepoConfig,
  })
  implements
    IFanoutSubscriberRepo<{
      readonly name: 'admissionResultsFanout';
    }>
{
  static override readonly fixedDORepoConfig =
    aggregateVersionRepoFixedDORepoConfig;

  readonly #asyncCommandOutbox = makeOutboxQueue({
    name: 'asyncCommandOutbox',
    db: this.db,
    alarmRegistry: this.alarmRegistry,
    outboxTable: asyncOperationsDbConfig.schema.asyncCommandOutbox,
    indexColumnName: 'outboxIndex',

    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* AggregateChain.getRepo({
          key: {
            systemId: this.key.systemId,
            aggregateName: this.key.aggregateName,
            aggregateId: this.key.aggregateId,
          },
        });
        for (const row of rows) {
          const work = yield* readPreparedAggregateAsyncWork(
            this.db,
            row.asyncCommandId,
          );
          const owner =
            config.system.aggregates[this.key.aggregateName]?.[
              this.key.aggregateVersion
            ];
          if (owner === undefined) {
            return yield* makeZerospinError('async-owner-unavailable');
          }
          const contract = yield* resolveWorkContract(owner, work);
          const command = yield* makePreparedAggregateCommand(
            work,
            contract,
            this.key,
          );
          yield* makeAsync<
            Awaited<ReturnType<AggregateChain['admitAsyncCommand']>>
          >(() =>
            chain.admitAsyncCommand({
              ownerVersion: this.key.aggregateVersion,
              command,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
        }
      }),
  });
  readonly #asyncOperations = makeAsyncOperations({
    db: this.db,
    alarms: this.alarmRegistry,
    resolve: work =>
      Effect.gen({ self: this }, function* () {
        const owner =
          config.system.aggregates[this.key.aggregateName]?.[
            this.key.aggregateVersion
          ];
        if (owner === undefined) {
          return yield* makeZerospinError('async-operation-owner-unavailable');
        }
        return yield* resolveWorkContract(owner, work);
      }),
    run: program =>
      config.system.runtime.runPromise(program.pipe(Effect.provide(AsyncLive))),
    background: promise => this.ctx.waitUntil(promise),
    deliver: () => this.#asyncCommandOutbox.drain(),
  });
  async getPreparedAsyncCommand(props: { commandId: string }) {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        const work = yield* readPreparedAggregateAsyncWork(
          this.db,
          props.commandId,
        );
        const owner =
          config.system.aggregates[this.key.aggregateName]?.[
            this.key.aggregateVersion
          ];
        if (owner === undefined) {
          return yield* makeZerospinError('async-operation-owner-unavailable');
        }
        const contract = yield* resolveWorkContract(owner, work);
        return yield* makePreparedAggregateCommand(work, contract, this.key);
      }).pipe(makeRpcEnvelope),
    );
  }
  readonly #execution = Effect.runSync(Semaphore.make(1));
  readonly #drainExecutionAfter = <A, E, R>(
    produce: () => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | IAnyError, R | Async> =>
    this.#executedAggregateCommandOutbox.drainAfter(() =>
      this.#executedCommandOutbox.drainAfter(produce),
    );

  readonly #executedAggregateCommandOutbox = makeOutboxQueue<
    'executedAggregateCommandOutbox',
    'executedIndex',
    typeof aggregateVersionRepoDbConfig.schema.executedAggregateCommandOutbox,
    typeof aggregateVersionRepoDbConfig.schema.executedAggregateCommandOutbox.$inferSelect
  >({
    name: 'executedAggregateCommandOutbox',
    indexColumnName: 'executedIndex',
    db: this.db,
    alarmRegistry: this.alarmRegistry,
    outboxTable: this.schema.executedAggregateCommandOutbox,
    deliver: (
      rows,
    ): Effect.Effect<void, IAnyError | IZerospinErrorJson, Async> =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* AggregateChain.getRepo({ key: this.key });
        yield* Effect.acquireUseRelease(
          makeAsync(() => chain.executedAggregateCommandSubscriber),
          receiver =>
            makeAsync(() =>
              receiver.receive(
                rows.map(command => ({
                  kind: 'command' as const,
                  executedIndex: command.executedIndex,
                  command,
                  operations: readAggregateVersionRepoOutput(
                    this.db,
                    command.id,
                  ),
                })),
              ),
            ).pipe(Effect.flatMap(readRpcEnvelope)),
          receiver => Effect.sync(() => receiver[Symbol.dispose]()),
        );
      }),
    storage: {
      hasPending: () =>
        this.db
          .select()
          .from(this.schema.executedAggregateCommandOutbox)
          .limit(1)
          .get() !== undefined,
      readPage: throughIndex =>
        this.db
          .select()
          .from(this.schema.executedAggregateCommandOutbox)
          .where(
            throughIndex === undefined
              ? undefined
              : lte(
                  this.schema.executedAggregateCommandOutbox.executedIndex,
                  throughIndex,
                ),
          )
          .orderBy(this.schema.executedAggregateCommandOutbox.executedIndex)
          .limit(64)
          .all()
          .map(row => ({ index: row.executedIndex, row })),
      recordFailure: (indices, failure) => {
        this.db
          .update(this.schema.executedAggregateCommandOutbox)
          .set({ lastDeliveryFailure: failure })
          .where(
            inArray(this.schema.executedAggregateCommandOutbox.executedIndex, [
              ...indices,
            ]),
          )
          .run();
      },
      acknowledge: indices =>
        this.db.transaction(tx => {
          tx.delete(this.schema.executedAggregateCommandOutbox)
            .where(
              inArray(
                this.schema.executedAggregateCommandOutbox.executedIndex,
                [...indices],
              ),
            )
            .run();
          deleteDeliveredAggregateMaterial(tx, indices);
        }),
    },
  });
  readonly #executedCommandOutbox = makeOutboxQueue({
    indexColumnName: 'executedIndex',
    name: 'executedCommandOutbox',
    db: this.db,
    outboxTable: aggregateVersionRepoDbConfig.schema.executedCommandOutbox,
    alarmRegistry: this.alarmRegistry,

    storage: {
      readPage: (
        throughIndex,
      ): readonly {
        row: IExecutedCommandOutboxRow;
        index: number;
      }[] =>
        readOwnerResultsPage({
          db: this.db,
          commands: this.schema.executedCommandOutbox,
          afterIndex: 0,
          ...(throughIndex === undefined ? {} : { maxIndex: throughIndex }),
        }).rows.map(({ row, index }) => ({
          index,
          row: {
            ...row,
            operations: readAggregateVersionRepoOutput(this.db, row.command.id),
          },
        })),
      hasPending: () =>
        [this.schema.executedCommandOutbox].some(
          table =>
            this.db
              .select({ index: table.executedIndex })
              .from(table)
              .limit(1)
              .get() !== undefined,
        ),
      recordFailure: (indices, failure) =>
        this.db.transaction(tx => {
          for (const table of [this.schema.executedCommandOutbox]) {
            tx.update<SQLiteTable>(table)
              .set({ lastDeliveryFailure: failure })
              .where(inArray(table.executedIndex, [...indices]))
              .run();
          }
        }),
      acknowledge: indices =>
        this.db.transaction(tx => {
          for (const table of [this.schema.executedCommandOutbox]) {
            const page = inArray(table.executedIndex, [...indices]);
            tx.delete(table).where(page).run();
          }
          deleteDeliveredAggregateMaterial(tx, indices);
        }),
    },
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const deliveries: IExecutedCommandDelivery[] = [];
        for (const row of rows) {
          if (!('kind' in row)) {
            return yield* makeZerospinError('execution-result-missing');
          }
          if (row.kind === 'command') {
            if (!('operations' in row) || !Array.isArray(row.operations)) {
              return yield* makeZerospinError('execution-operations-missing');
            }
            deliveries.push({
              ...row,
              operations: row.operations,
            });
          }
        }
        const chain = yield* AggregateVersionChain.getRepo({
          key: this.key,
        });
        yield* Effect.acquireUseRelease(
          makeAsync(() => chain.executedCommandSubscriber),
          subscriber =>
            makeAsync(() => subscriber.receive(deliveries)).pipe(
              Effect.flatMap(envelope => readRpcEnvelope(envelope)),
            ),
          subscriber => Effect.sync(() => subscriber[Symbol.dispose]()),
        );
      }),
  });
  /** Receive admitted rows through a source-bound fanout subscriber capability. */
  admissionResultsFanoutSubscriber(sourceKey: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
  }): ReturnType<
    typeof makeFanoutSubscriber<
      'admissionResultsFanout',
      typeof sourceKey,
      typeof this.key,
      IChainInput | typeof aggregateChainDbConfig.schema.commands.$inferSelect
    >
  > {
    if (
      sourceKey.systemId !== this.key.systemId ||
      sourceKey.aggregateId !== this.key.aggregateId ||
      sourceKey.aggregateName !== this.key.aggregateName
    ) {
      throw makeZerospinError({
        code: 'aggregate-fanout-source-invalid',
        message: 'Aggregate fanout source must match the materializer owner',
      });
    }
    return makeFanoutSubscriber({
      name: 'admissionResultsFanout',
      sourceKey,
      key: this.key,
      getRepo: AggregateChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(aggregateVersionRepoDbConfig.schema.head)
          .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
          .get()?.aggregateIndex ?? 0,
      receive: ({
        rows: inputs,
      }: IFanoutDelivery<
        IChainInput | typeof aggregateChainDbConfig.schema.commands.$inferSelect
      >) =>
        this.#asyncOperations.afterExecution(() =>
          this.#drainExecutionAfter(() =>
            Effect.gen({ self: this }, function* () {
              for (const input of inputs) {
                if (!('command' in input)) {
                  return yield* makeZerospinError('chain-input-incomplete');
                }
                if (
                  !input.originalResultSaved &&
                  input.command.originalExecutionVersion !==
                    this.key.aggregateVersion
                ) {
                  return yield* makeZerospinError('original-executor-mismatch');
                }
                yield* executeCommands({
                  commands: [input.command],
                  db: this.db,
                  key: this.key,
                  execution: this.#execution,
                });
              }
            }),
          ),
        ),
    });
  }
  /*
   * Exposes the already bound executedCommands capability from AggregateVersionRepo.
   *
   * 1. Return the bound capability.
   */
  get executedCommandOutbox() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executedCommandOutbox;
  }
  /** Initialize this version-owned shared-input materialization head. */
  override onDOActivation() {
    return onDOActivation({ repo: this }).pipe(
      Effect.andThen(this.#asyncOperations.recover()),
    );
  }
  /*
   * Direct finalization asks this version-owned
   * materializer to execute through a fixed aggregate index. It prepares new inputs,
   * commits state and terminal output atomically, and recovers exact results on retry.
   *
   * 2. Hold the executedCommands publication lease.
   * 3. Catch up through the bound subscriber and recover the terminal result.
   * 4. Schedule executedCommands delivery on every outcome.
   */
  async execute(props: { aggregateIndex: number }) {
    return config.system.runtime.runPromise(
      this.#drainExecutionAfter(() =>
        Effect.gen({ self: this }, function* () {
          // 2 — drainAfter retains recovery before executing commands
          // 3 — catch up through the bound subscriber and recover the requested result
          return yield* execute({
            ...props,
            db: this.db,
            key: this.key,
            subscriber: this.admissionResultsFanoutSubscriber({
              systemId: this.key.systemId,
              aggregateId: this.key.aggregateId,
              aggregateName: this.key.aggregateName,
            }),
          });
        }),
      ).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  /*
   * Cutover asks a version-owned aggregate materializer to execute and durably
   * publish one fixed checkpoint. The returned identity and disposition hash come
   * from retained VAC history after executedCommands-outbox acknowledgement.
   *
   * 1. Run the bound domain operation.
   */
  async flush(aggregateIndex: number) {
    // 1 — run flush with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      flush({
        aggregateIndex,
        repo: this,
        executedCommandOutbox: this.#executedCommandOutbox,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  /** Catch up the shared input journal, then publish the captured local checkpoint. */
  async catchupMaterialization() {
    return config.system.runtime.runPromise(
      this.#drainExecutionAfter(() =>
        Effect.gen({ self: this }, function* () {
          yield* makeAsync(() =>
            this.admissionResultsFanoutSubscriber(this.key).catchup(),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          const executedIndex =
            this.db
              .select()
              .from(this.schema.head)
              .where(eq(this.schema.head.singletonId, 1))
              .get()?.executedIndex ?? 0;
          yield* this.#executedCommandOutbox.drain(executedIndex);
          return executedIndex;
        }),
      ).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  /*
   * 1. Take the encoded select query from the RPC props.
   * 2. Run AggregateVersionRepo.executeSelectQuery against this DO's db.
   * 3. makeRpcEnvelope the Effect result at the Durable Object boundary.
   */
  async executeSelectQuery(props: {
    aggregateName: string;
    query: IEncodedQuery;
  }) {
    // 1 — query: IEncodedQuery (aggregateName is accepted on the wire but unused here)
    const { query } = props;
    // 2 — executeSelectQuery({ db: this.db, query })
    // 3 — config.system.runtime.runPromise(...pipe(makeRpcEnvelope))
    return config.system.runtime.runPromise(
      executeSelectQuery({ db: this.db, query }).pipe(makeRpcEnvelope),
    );
  }
  /*
   * 1. Bind this DO's aggregateVersion into the authorize props.
   * 2. Run AggregateVersionRepo.authorizeAggregateSession on this db.
   * 3. makeRpcEnvelope the Effect result at the Durable Object boundary.
   */
  async authorizeAggregateSession(props: {
    actorName: string;
    actorVersion: string;
    aggregateId: IAggregateId;
    aggregateName: string;
    sessionName: string;
    claims: Readonly<Record<string, unknown>>;
  }) {
    // 1 — spread props + db + this.key.aggregateVersion
    // 2 — authorizeAggregateSession(...)
    // 3 — config.system.runtime.runPromise(...pipe(makeRpcEnvelope))
    return config.system.runtime.runPromise(
      authorizeAggregateSession({
        ...props,
        db: this.db,
        aggregateVersion: this.key.aggregateVersion,
      }).pipe(makeRpcEnvelope),
    );
  }
}
