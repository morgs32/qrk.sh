import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { type AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IEncodedQuery } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Semaphore, type Schema } from 'effect';
import { system } from 'system';

import { AggregateChain } from '../AggregateChain/AggregateChain.js';
import type { aggregateChainDbConfig } from '../AggregateChain/aggregateChainDbConfig.js';
import type {
  IFanoutDelivery,
  IFanoutSubscriberRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
import { VersionedAggregateChain } from '../VersionedAggregateChain/VersionedAggregateChain.js';
import { VersionedServiceChain } from '../VersionedServiceChain/VersionedServiceChain.js';
import type { versionedServiceChainDbConfig } from '../VersionedServiceChain/versionedServiceChainDbConfig.js';

import { authorizeAggregateFrontend } from './authorizeAggregateFrontend/authorizeAggregateFrontend.js';
import { execute } from './execute/execute.js';
import { executeCommands } from './executeCommands/executeCommands.js';
import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { flush } from './flush/flush.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import { receiveServiceCommandsTx } from './receiveServiceCommandsTx.js';
import {
  VersionedAggregateRepoDb,
  versionedAggregateRepoDbConfig,
  versionedAggregateRepoTables,
} from './versionedAggregateRepoDbConfig.js';

const versionedAggregateRepoFixedDORepoConfig = makeFixedDORepoConfig({
  repoType: 'VersionedAggregateRepo',
  abbreviation: systemWorkerAbbreviations.versionedAggregateRepo,
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion',
  ),
  managedRuntime,
  /*
   * 1. Resolve the authored aggregate by DO name key.
   * 2. Slice the pinned aggregateVersion snapshot.
   * 3. Build the fixed DB config from that version's models.
   */
  dbConfig: Effect.fn('VersionedAggregateRepo.dbConfig')(function* ({ key }) {
    // 1 — system.aggregates[key.aggregateName] or throw
    const latestAggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });

    // 2 — latestAggregate.getVersion; fail if the snapshot is unsupported
    const aggregate = yield* getByKeyOrThrow({
      record: latestAggregate,
      key: key.aggregateVersion,
      recordKind: 'listed versions',
    });

    // 3 — combine the selected models with the Repo-owned metadata tables
    return makeResourceDbConfig({
      otherTables: versionedAggregateRepoTables,
      models: aggregate.models,
    });
  }),
});

export class VersionedAggregateRepo
  extends makeFixedDORepo({
    namespaceBinding: 'VERSIONED_AGGREGATE_REPO',
    fixedDORepoConfig: versionedAggregateRepoFixedDORepoConfig,
  })
  implements
    IFanoutSubscriberRepo<{
      readonly name: 'versionedAggregateFanoutQueue';
    }>,
    IFanoutSubscriberRepo<{
      readonly name: 'aggregateFanoutQueue';
    }>
{
  static override readonly fixedDORepoConfig =
    versionedAggregateRepoFixedDORepoConfig;

  readonly #execution = Effect.runSync(Semaphore.make(1));

  aggregateFanoutQueueSubscriber(sourceKey: {
    systemId: string;
    serviceName: string;
    serviceVersion: string;
  }): ReturnType<
    typeof makeFanoutSubscriber<
      'aggregateFanoutQueue',
      typeof sourceKey,
      typeof this.key,
      typeof versionedServiceChainDbConfig.schema.commands.$inferSelect
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
      .from(versionedAggregateRepoDbConfig.schema.services)
      .where(
        eq(
          versionedAggregateRepoDbConfig.schema.services.serviceName,
          sourceKey.serviceName,
        ),
      )
      .get();
    if (
      sourceKey.systemId !== this.key.systemId ||
      source === undefined ||
      aggregate.services[sourceKey.serviceName] !== sourceKey.serviceVersion
    ) {
      throw new ZerospinError({
        code: 'replica-source-invalid',
        message: 'Service fanout source must match an enrolled pinned source',
      });
    }
    return makeFanoutSubscriber({
      name: 'aggregateFanoutQueue',
      sourceKey,
      key: this.key,
      getRepo: VersionedServiceChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(versionedAggregateRepoDbConfig.schema.services)
          .where(
            eq(
              versionedAggregateRepoDbConfig.schema.services.serviceName,
              sourceKey.serviceName,
            ),
          )
          .get()?.lastIndex ?? 0,

      receive: ({
        rows,
      }: IFanoutDelivery<{
        outboxIndex: number;
        entry: string;
        executionVersion: string;
      }>) =>
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
            yield* receiveServiceCommandsTx({
              rows,
              sourceKey,
              aggregate,
            }).pipe(Effect.provideService(VersionedAggregateRepoDb, this.db));
          }),
        ),
    });
  }

  readonly #executedCommands = makeOutboxQueue({
    name: 'executedCommands',
    db: this.db,
    outboxTable: versionedAggregateRepoDbConfig.schema.executedCommands,
    alarmRegistry: this.alarmRegistry,
    retention: 'delete',
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* VersionedAggregateChain.getRepo({
          key: this.key,
        });
        const subscriber = yield* makeAsync(
          () => chain.executedCommandsSubscriber,
        );
        yield* makeAsync(() => subscriber.receive(rows)).pipe(
          Effect.flatMap(decodeRpc),
        );
      }),
  });

  /** Receive admitted rows through a source-bound fanout subscriber capability. */
  versionedAggregateFanoutQueueSubscriber(sourceKey: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
  }): ReturnType<
    typeof makeFanoutSubscriber<
      'versionedAggregateFanoutQueue',
      typeof sourceKey,
      typeof this.key,
      typeof aggregateChainDbConfig.schema.admittedCommands.$inferSelect
    >
  > {
    if (
      sourceKey.systemId !== this.key.systemId ||
      sourceKey.aggregateId !== this.key.aggregateId ||
      sourceKey.aggregateName !== this.key.aggregateName
    ) {
      throw new ZerospinError({
        code: 'aggregate-fanout-source-invalid',
        message: 'Aggregate fanout source must match the materializer owner',
      });
    }
    return makeFanoutSubscriber({
      name: 'versionedAggregateFanoutQueue',
      sourceKey,
      key: this.key,
      getRepo: AggregateChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(versionedAggregateRepoDbConfig.schema.head)
          .where(eq(versionedAggregateRepoDbConfig.schema.head.singletonId, 1))
          .get()?.aggregateIndex ?? 0,
      receive: ({
        rows: commands,
      }: IFanoutDelivery<
        typeof aggregateChainDbConfig.schema.admittedCommands.$inferSelect
      >) =>
        Effect.gen({ self: this }, function* () {
          yield* this.alarmRegistry.hold('executedCommands');
          yield* executeCommands({
            commands,
            db: this.db,
            key: this.key,
            execution: this.#execution,
          });
        }).pipe(
          Effect.onExit(() =>
            Effect.sync(() => {
              this.ctx.waitUntil(
                managedRuntime
                  .runPromise(
                    this.#executedCommands
                      .drain()
                      .pipe(Effect.provide(AsyncLive)),
                  )
                  .catch(() => undefined),
              );
            }),
          ),
        ),
    });
  }

  /*
   * Exposes the already bound executedCommands capability from VersionedAggregateRepo.
   *
   * 1. Return the bound capability.
   */
  get executedCommands() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#executedCommands;
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
  async execute(props: {
    aggregateIndex: number;
  }): Promise<
    IEncodedResult<
      Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        // 2 — retain executedCommands work before executing commands
        yield* this.alarmRegistry.hold('executedCommands');

        // 3 — catch up through the bound subscriber and recover the requested result
        return yield* execute({
          ...props,
          db: this.db,
          key: this.key,
          subscriber: this.versionedAggregateFanoutQueueSubscriber({
            systemId: this.key.systemId,
            aggregateId: this.key.aggregateId,
            aggregateName: this.key.aggregateName,
          }),
        });
      }).pipe(
        // 4 — waitUntil drains the outbox while the alarm preserves continuation
        Effect.onExit(() =>
          Effect.sync(() => {
            this.ctx.waitUntil(
              managedRuntime
                .runPromise(
                  this.#executedCommands
                    .drain()
                    .pipe(Effect.provide(AsyncLive)),
                )
                .catch(() => undefined),
            );
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
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
    return managedRuntime.runPromise(
      flush({
        aggregateIndex,
        repo: this,
        executedCommands: this.#executedCommands,
        key: this.key,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  /*
   * 1. Take the encoded select query from the RPC props.
   * 2. Run VersionedAggregateRepo.executeSelectQuery against this DO's db.
   * 3. encodeRpc the Effect result at the Durable Object boundary.
   */
  async executeSelectQuery(props: {
    aggregateName: string;
    query: IEncodedQuery;
  }): Promise<IEncodedResult<unknown, IAnyErrorJson>> {
    // 1 — query: IEncodedQuery (aggregateName is accepted on the wire but unused here)
    const { query } = props;

    // 2 — executeSelectQuery({ db: this.db, query })

    // 3 — managedRuntime.runPromise(...pipe(encodeRpc))
    return managedRuntime.runPromise(
      executeSelectQuery({ db: this.db, query }).pipe(encodeRpc),
    );
  }

  /*
   * 1. Bind this DO's aggregateVersion into the authorize props.
   * 2. Run VersionedAggregateRepo.authorizeAggregateFrontend on this db.
   * 3. encodeRpc the Effect result at the Durable Object boundary.
   */
  async authorizeAggregateFrontend(props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    userId: string;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    // 1 — spread props + db + this.key.aggregateVersion

    // 2 — authorizeAggregateFrontend(...)

    // 3 — managedRuntime.runPromise(...pipe(encodeRpc))
    return managedRuntime.runPromise(
      authorizeAggregateFrontend({
        ...props,
        db: this.db,
        aggregateVersion: this.key.aggregateVersion,
      }).pipe(encodeRpc),
    );
  }
}
