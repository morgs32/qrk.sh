import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IEncodedQuery } from '@zerospin/core/system/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { asc, eq, inArray, isNull } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { Effect, Semaphore } from 'effect';

import { AggregateChain } from '../AggregateChain/AggregateChain.js';
import type { aggregateChainDbConfig } from '../AggregateChain/aggregateChainDbConfig.js';
import { AggregateVersionChain } from '../AggregateVersionChain/AggregateVersionChain.js';
import type {
  IFanoutDelivery,
  IFanoutSubscriberRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';
import { readExecutedCommandsPage } from '../readExecutedCommandsPage/readExecutedCommandsPage.js';
import { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';
import type { serviceVersionChainDbConfig } from '../ServiceVersionChain/serviceVersionChainDbConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { aggregateVersionRepoDbConfig } from './aggregateVersionRepoDbConfig.js';
import { authorizeAggregateSession } from './authorizeAggregateSession/authorizeAggregateSession.js';
import { execute } from './execute/execute.js';
import { executeCommands } from './executeCommands/executeCommands.js';
import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { flush } from './flush/flush.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import { receiveServiceCommandsTx } from './receiveServiceCommandsTx.js';
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
    }>,
    IFanoutSubscriberRepo<{
      readonly name: 'serviceResultsToAggregatesFanout';
    }>
{
  static override readonly fixedDORepoConfig =
    aggregateVersionRepoFixedDORepoConfig;

  readonly #execution = Effect.runSync(Semaphore.make(1));

  serviceResultsToAggregatesFanoutSubscriber(sourceKey: {
    systemId: string;
    serviceName: string;
    serviceVersion: string;
  }): ReturnType<
    typeof makeFanoutSubscriber<
      'serviceResultsToAggregatesFanout',
      typeof sourceKey,
      typeof this.key,
      typeof serviceVersionChainDbConfig.schema.commands.$inferSelect
    >
  > {
    const aggregate = Effect.runSync(
      getByKeyOrThrow({
        record: system.aggregates,
        key: this.key.aggregateName,
        recordKind: 'aggregates',
      }).pipe(
        Effect.flatMap(aggregate =>
          getByKeyOrThrow({
            record: aggregate,
            key: this.key.aggregateVersion,
            recordKind: 'aggregate versions',
          }),
        ),
      ),
    );
    const source = this.db
      .select()
      .from(aggregateVersionRepoDbConfig.schema.services)
      .where(
        eq(
          aggregateVersionRepoDbConfig.schema.services.serviceName,
          sourceKey.serviceName,
        ),
      )
      .get();
    if (
      sourceKey.systemId !== this.key.systemId ||
      source === undefined ||
      aggregate.services[sourceKey.serviceName] !== sourceKey.serviceVersion
    ) {
      throw makeZerospinError({
        code: 'replica-source-invalid',
        message: 'Service fanout source must match an enrolled pinned source',
      });
    }
    return makeFanoutSubscriber({
      name: 'serviceResultsToAggregatesFanout',
      sourceKey,
      key: this.key,
      getRepo: ServiceVersionChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(aggregateVersionRepoDbConfig.schema.services)
          .where(
            eq(
              aggregateVersionRepoDbConfig.schema.services.serviceName,
              sourceKey.serviceName,
            ),
          )
          .get()?.lastIndex ?? 0,

      receive: ({
        rows,
      }: IFanoutDelivery<
        typeof serviceVersionChainDbConfig.schema.commands.$inferSelect
      >) =>
        this.#executionResultsOutbox.drainAfter(() =>
          this.#execution.withPermits(1)(
            Effect.gen({ self: this }, function* () {
              const latest = yield* getByKeyOrThrow({
                record: system.aggregates,
                key: this.key.aggregateName,
                recordKind: 'aggregates',
              });
              const aggregate = yield* getByKeyOrThrow({
                record: latest,
                key: this.key.aggregateVersion,
                recordKind: 'listed versions',
              });
              yield* receiveServiceCommandsTx(this.db, {
                rows,
                sourceKey,
                aggregate,
              });
            }),
          ),
        ),
    });
  }

  readonly #executionResultsOutbox = makeOutboxQueue({
    indexColumnName: 'executedIndex',
    name: 'executionResultsOutbox',
    db: this.db,
    outboxTable: aggregateVersionRepoDbConfig.schema.aggregateCommands,
    alarmRegistry: this.alarmRegistry,
    retention: 'delete',
    storage: {
      readPage: (
        throughIndex,
      ): readonly { row: IExecutedCommandOutboxRow; index: number }[] =>
        readExecutedCommandsPage({
          db: this.db,
          aggregateCommands: this.schema.aggregateCommands,
          serviceCommands: this.schema.serviceCommands,
          afterIndex: 0,
          ...(throughIndex === undefined ? {} : { maxIndex: throughIndex }),
          aggregateWhere: isNull(this.schema.aggregateCommands.acknowledgedAt),
          serviceWhere: isNull(this.schema.serviceCommands.acknowledgedAt),
        }).rows.map(({ row, index }) => ({
          index,
          row: {
            ...row,
            mutations: this.db
              .select()
              .from(this.schema.mutations)
              .where(eq(this.schema.mutations.executedIndex, index))
              .orderBy(asc(this.schema.mutations.mutationIndex))
              .all(),
          },
        })),
      hasPending: () =>
        [this.schema.aggregateCommands, this.schema.serviceCommands].some(
          table =>
            this.db
              .select({ index: table.executedIndex })
              .from(table)
              .where(isNull(table.acknowledgedAt))
              .limit(1)
              .get() !== undefined,
        ),
      recordFailure: (indices, failure) =>
        this.db.transaction(tx => {
          for (const table of [
            this.schema.aggregateCommands,
            this.schema.serviceCommands,
          ]) {
            tx.update<SQLiteTable>(table)
              .set({ lastDeliveryFailure: failure })
              .where(inArray(table.executedIndex, [...indices]))
              .run();
          }
        }),
      acknowledge: (indices, retention) =>
        this.db.transaction(tx => {
          tx.delete(this.schema.mutations)
            .where(inArray(this.schema.mutations.executedIndex, [...indices]))
            .run();
          for (const table of [
            this.schema.aggregateCommands,
            this.schema.serviceCommands,
          ]) {
            const page = inArray(table.executedIndex, [...indices]);
            if (retention === 'delete') {
              tx.delete(table).where(page).run();
            } else {
              tx.update<SQLiteTable>(table)
                .set({ acknowledgedAt: new Date(), lastDeliveryFailure: null })
                .where(page)
                .run();
            }
          }
        }),
    },
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const deliveries: IExecutedCommandDelivery[] = [];
        for (const row of rows) {
          if (!('mutations' in row) || !Array.isArray(row.mutations)) {
            return yield* makeZerospinError('execution-mutations-missing');
          }
          deliveries.push({ ...row, mutations: row.mutations });
        }
        const chain = yield* AggregateVersionChain.getRepo({
          key: this.key,
        });
        const subscriber = yield* makeAsync(
          () => chain.executedCommandsSubscriber,
        );
        yield* makeAsync(() => subscriber.receive(deliveries)).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
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
      typeof aggregateChainDbConfig.schema.commands.$inferSelect
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
        rows: commands,
      }: IFanoutDelivery<
        typeof aggregateChainDbConfig.schema.commands.$inferSelect
      >) =>
        this.#executionResultsOutbox.drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            yield* executeCommands({
              commands,
              db: this.db,
              key: this.key,
              execution: this.#execution,
            });
          }),
        ),
    });
  }

  /*
   * Exposes the already bound executedCommands capability from AggregateVersionRepo.
   *
   * 1. Return the bound capability.
   */
  get executionResultsOutbox() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executionResultsOutbox;
  }

  /** Subscribe to the services declared by this immutable aggregate snapshot. */
  override onDOActivation() {
    return onDOActivation({ repo: this });
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
      this.#executionResultsOutbox
        .drainAfter(() =>
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
        )
        .pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
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
        executionResultsOutbox: this.#executionResultsOutbox,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }

  /** Catch up through bounded source tips, then publish the captured local checkpoint. */
  async catchupMaterialization() {
    return config.system.runtime.runPromise(
      this.#executionResultsOutbox
        .drainAfter(() =>
          Effect.gen({ self: this }, function* () {
            yield* makeAsync(() =>
              this.admissionResultsFanoutSubscriber(this.key).catchup(),
            ).pipe(Effect.flatMap(readRpcEnvelope));
            const latest = yield* getByKeyOrThrow({
              record: system.aggregates,
              key: this.key.aggregateName,
              recordKind: 'aggregates',
            });
            const aggregate = yield* getByKeyOrThrow({
              record: latest,
              key: this.key.aggregateVersion,
              recordKind: 'listed versions',
            });
            for (const [serviceName, serviceVersion] of Object.entries(
              aggregate.services,
            )) {
              yield* makeAsync(() =>
                this.serviceResultsToAggregatesFanoutSubscriber({
                  systemId: this.key.systemId,
                  serviceName,
                  serviceVersion,
                }).catchup(),
              ).pipe(Effect.flatMap(readRpcEnvelope));
            }
            const executedIndex =
              this.db
                .select()
                .from(this.schema.head)
                .where(eq(this.schema.head.singletonId, 1))
                .get()?.executedIndex ?? 0;
            yield* this.#executionResultsOutbox.drain(executedIndex);
            return executedIndex;
          }),
        )
        .pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
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
