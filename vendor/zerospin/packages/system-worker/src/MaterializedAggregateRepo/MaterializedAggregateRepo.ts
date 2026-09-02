import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type {
  AggregateChainedCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IEncodedQuery } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Semaphore, type Schema } from 'effect';
import { system } from 'system';

import { getAggregateCommandChain } from '../AggregateCommandChain/getAggregateCommandChain/getAggregateCommandChain.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { authorizeAggregateFrontend } from './authorizeAggregateFrontend/authorizeAggregateFrontend.js';
import { catchup } from './catchup/catchup.js';
import { execute } from './execute/execute.js';
import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { isServiceCommandRelevant } from './isServiceCommandRelevant/isServiceCommandRelevant.js';
import {
  makeMaterializedAggregateRepoDbConfig,
  materializedAggregateRepoDrizzleSchemas,
} from './MaterializedAggregateRepoDbConfig.js';

const materializedAggregateRepoFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.materializedAggregateRepo,
  repoType: 'MaterializedAggregateRepo',
  namePattern: RoutePattern.parse('/:systemId/:aggregateId/:aggregateName'),
  managedRuntime,
  getDbConfig: Effect.fn('MaterializedAggregateRepo.getDbConfig')(function* ({
    key,
  }) {
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    return makeMaterializedAggregateRepoDbConfig({
      models: aggregate.models,
    });
  }),
  bootstrap: Effect.fn('MaterializedAggregateRepo.bootstrap')(
    function* (props: {
      ctx: DurableObjectState;
      name: string;
      key: {
        systemId: string;
        aggregateId: string;
        aggregateName: string;
      };
      db: unknown;
      schema: unknown;
      relations: unknown;
    }) {
      const { key } = props;
      yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
        SystemRepo.getRepo({ systemId: key.systemId }).upsertAggregate({
          aggregateId: key.aggregateId,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
    },
  ),
});

export class MaterializedAggregateRepo extends makeFixedDORepo({
  fixedDORepoConfig: materializedAggregateRepoFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    materializedAggregateRepoFixedDORepoConfig;
  private readonly executionSemaphore = Effect.runSync(Semaphore.make(1));

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        Effect.gen({ self: this }, function* () {
          yield* Effect.promise(() => this.fixedDORepoInitialization);
          const aggregateCommandChain = yield* getAggregateCommandChain({
            key: {
              systemId: this.key.systemId,
              aggregateId: this.key.aggregateId,
              aggregateName: this.key.aggregateName,
            },
          });
          const currentAggregateIndex =
            this.db
              .select()
              .from(
                materializedAggregateRepoDrizzleSchemas.materializationState,
              )
              .where(
                eq(
                  materializedAggregateRepoDrizzleSchemas.materializationState
                    .id,
                  1,
                ),
              )
              .get()?.aggregateIndex ?? 0;
          yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              aggregateCommandChain.subscribeMaterializedAggregate({
                currentAggregateIndex:
                  currentAggregateIndex === 0 ? null : currentAggregateIndex,
                materializedAggregateRepoName: this.name,
              }),
            ZerospinError.catch({
              code: 'materialized-aggregate-subscription-rpc-failed',
              message: `Failed to subscribe ${this.name} before catch-up`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* this.executionSemaphore.withPermits(1)(
            catchup({
              db: this.db,
              key: this.key,
              throughAggregateIndex: undefined,
            }),
          );
          const caughtUpAggregateIndex =
            this.db
              .select()
              .from(
                materializedAggregateRepoDrizzleSchemas.materializationState,
              )
              .where(
                eq(
                  materializedAggregateRepoDrizzleSchemas.materializationState
                    .id,
                  1,
                ),
              )
              .get()?.aggregateIndex ?? 0;
          yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              aggregateCommandChain.subscribeMaterializedAggregate({
                currentAggregateIndex:
                  caughtUpAggregateIndex === 0 ? null : caughtUpAggregateIndex,
                materializedAggregateRepoName: this.name,
              }),
            ZerospinError.catch({
              code: 'materialized-aggregate-subscription-ack-rpc-failed',
              message: `Failed to acknowledge catch-up for ${this.name}`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
  }

  async execute(props: {
    command: Schema.Schema.Type<typeof AggregateChainedCommandSchema>;
  }): Promise<
    IEncodedResult<
      Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          execute({ command: props.command, db: this.db, key: this.key }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async catchup(props?: {
    throughAggregateIndex?: number;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          catchup({
            db: this.db,
            key: this.key,
            throughAggregateIndex: props?.throughAggregateIndex,
          }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async isServiceCommandRelevant(props: {
    command: Schema.Schema.Type<typeof ServiceChainedCommandSchema>;
  }): Promise<IEncodedResult<boolean, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      isServiceCommandRelevant({
        aggregateName: this.key.aggregateName,
        command: props.command,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }

  async executeSelectQuery(props: {
    aggregateName: string;
    query: IEncodedQuery;
  }): Promise<IEncodedResult<unknown, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      executeSelectQuery({ db: this.db, query: props.query }).pipe(encodeRpc),
    );
  }

  async authorizeAggregateFrontend(props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    userId: string;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      authorizeAggregateFrontend({ ...props, db: this.db }).pipe(encodeRpc),
    );
  }
}
