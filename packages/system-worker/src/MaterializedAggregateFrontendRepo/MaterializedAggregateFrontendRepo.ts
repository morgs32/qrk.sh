import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import type {
  IAggregateFrontendPushedCommand,
  IAggregateFrontendSyncState,
  IFrontendDelta,
} from '@zerospin/core/session/types';
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

import { AggregateCommandChain } from '../AggregateCommandChain/AggregateCommandChain.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { alarm } from './alarm/alarm.js';
import { catchup } from './catchup/catchup.js';
import { execute } from './execute/execute.js';
import { executePushedCommand } from './executePushedCommand/executePushedCommand.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { getState } from './getState/getState.js';
import {
  makeMaterializedAggregateFrontendRepoDbConfig,
  materializedAggregateFrontendRepoDrizzleSchemas,
} from './MaterializedAggregateFrontendRepoDbConfig.js';
import { runScheduledWork } from './runScheduledWork/runScheduledWork.js';

const materializedAggregateFrontendRepoFixedDORepoConfig =
  makeFixedDORepoConfig({
    abbreviation: systemWorkerAbbreviations.materializedAggregateFrontendRepo,
    repoType: 'MaterializedAggregateFrontendRepo',
    namePattern: RoutePattern.parse(
      '/:systemId/:aggregateId/:aggregateName/:userId/:frontendName',
    ),
    managedRuntime,
    getDbConfig: Effect.fn('MaterializedAggregateFrontendRepo.getDbConfig')(
      function* ({ key }) {
        const aggregate = yield* getByKeyOrThrow({
          record: system.aggregates,
          key: key.aggregateName,
          recordKind: 'aggregates',
        });
        const frontendBinding = yield* getByKeyOrThrow({
          record: aggregate.frontends,
          key: key.frontendName,
          recordKind: `frontends owned by aggregate ${key.aggregateName}`,
        });
        return yield* makeMaterializedAggregateFrontendRepoDbConfig({
          aggregateName: key.aggregateName,
          aggregateModels: aggregate.models,
          frontendModels: frontendBinding.controller.models,
        });
      },
    ),
  });

export class MaterializedAggregateFrontendRepo extends makeFixedDORepo({
  fixedDORepoConfig: materializedAggregateFrontendRepoFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    materializedAggregateFrontendRepoFixedDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    storage: this.ctx.storage,
  });
  private readonly executionSemaphore = Effect.runSync(Semaphore.make(1));

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        Effect.gen({ self: this }, function* () {
          yield* Effect.promise(() => this.fixedDORepoInitialization);
          const retained = this.db
            .select()
            .from(
              materializedAggregateFrontendRepoDrizzleSchemas.projectionState,
            )
            .where(
              eq(
                materializedAggregateFrontendRepoDrizzleSchemas.projectionState
                  .id,
                1,
              ),
            )
            .get();
          if (retained === undefined) {
            this.db
              .insert(
                materializedAggregateFrontendRepoDrizzleSchemas.projectionState,
              )
              .values({
                id: 1,
                systemId: this.key.systemId,
                aggregateId: this.key.aggregateId,
                aggregateName: this.key.aggregateName,
                userId: this.key.userId,
                frontendName: this.key.frontendName,
                status: 'initializing',
                aggregateIndex: 0,
                pushIndex: 0,
                frontendIndex: 0,
              })
              .run();
          } else if (
            retained.systemId !== this.key.systemId ||
            retained.aggregateId !== this.key.aggregateId ||
            retained.aggregateName !== this.key.aggregateName ||
            retained.userId !== this.key.userId ||
            retained.frontendName !== this.key.frontendName
          ) {
            return yield* new ZerospinError({
              code: 'materialized-aggregate-frontend-state-target-mismatch',
              message: 'Persisted projection state belongs to another target',
            });
          }
          const aggregateCommandChainName =
            yield* AggregateCommandChain.fixedDORepoConfig.nameUtils.makeName({
              systemId: this.key.systemId,
              aggregateId: this.key.aggregateId,
              aggregateName: this.key.aggregateName,
            });
          const aggregateCommandChain =
            this.env.AGGREGATE_COMMAND_CHAIN.getByName(
              aggregateCommandChainName,
            );
          const currentAggregateIndex = retained?.aggregateIndex ?? 0;
          yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              aggregateCommandChain.subscribeMaterializedAggregateFrontend({
                currentAggregateIndex:
                  currentAggregateIndex === 0 ? null : currentAggregateIndex,
                materializedAggregateFrontendRepoName: this.name,
                userId: this.key.userId,
                frontendName: this.key.frontendName,
              }),
            ZerospinError.catch({
              code: 'materialized-aggregate-frontend-subscription-rpc-failed',
              message: `Failed to subscribe ${this.name} before catch-up`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* this.executionSemaphore.withPermits(1)(
            catchup({
              aggregateCommandChains: this.env.AGGREGATE_COMMAND_CHAIN,
              db: this.db,
              key: this.key,
              schema: this.schema,
              throughAggregateIndex: undefined,
            }),
          );
          this.db
            .update(
              materializedAggregateFrontendRepoDrizzleSchemas.projectionState,
            )
            .set({ status: 'ready' })
            .where(
              eq(
                materializedAggregateFrontendRepoDrizzleSchemas.projectionState
                  .id,
                1,
              ),
            )
            .run();
          const caughtUpAggregateIndex =
            this.db
              .select()
              .from(
                materializedAggregateFrontendRepoDrizzleSchemas.projectionState,
              )
              .where(
                eq(
                  materializedAggregateFrontendRepoDrizzleSchemas
                    .projectionState.id,
                  1,
                ),
              )
              .get()?.aggregateIndex ?? 0;
          yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              aggregateCommandChain.subscribeMaterializedAggregateFrontend({
                currentAggregateIndex:
                  caughtUpAggregateIndex === 0 ? null : caughtUpAggregateIndex,
                materializedAggregateFrontendRepoName: this.name,
                userId: this.key.userId,
                frontendName: this.key.frontendName,
              }),
            ZerospinError.catch({
              code: 'materialized-aggregate-frontend-subscription-ack-rpc-failed',
              message: `Failed to acknowledge catch-up for ${this.name}`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* runScheduledWork({
            db: this.db,
            deliveryQueue: this.deliveryQueue,
            finalizedCommandChains:
              this.env.AGGREGATE_FRONTEND_FINALIZED_COMMAND_CHAIN,
            key: this.key,
            storage: this.ctx.storage,
          });
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
  }

  async execute(props: {
    command: Schema.Schema.Type<typeof AggregateChainedCommandSchema>;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          execute({
            aggregateCommandChains: this.env.AGGREGATE_COMMAND_CHAIN,
            command: props.command,
            db: this.db,
            key: this.key,
            schema: this.schema,
          }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      this.runScheduledWork().then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async executePushedCommand(props: {
    chainedAt: Date;
    command: IEncodedCommand<
      IChainedCommand<ISessionCommand, IFrontendDelta> &
        Readonly<{ sessionIndex: number; pushIndex: null }>
    >;
    pushIndex: number;
  }): Promise<
    IEncodedResult<
      IEncodedCommand<IAggregateFrontendPushedCommand>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          executePushedCommand({
            ...props,
            db: this.db,
            key: this.key,
          }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async catchup(props?: {
    throughAggregateIndex?: number;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          catchup({
            aggregateCommandChains: this.env.AGGREGATE_COMMAND_CHAIN,
            db: this.db,
            key: this.key,
            schema: this.schema,
            throughAggregateIndex: props?.throughAggregateIndex,
          }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      this.runScheduledWork().then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async getState(props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    userId: string;
    frontendName: string;
  }): Promise<IEncodedResult<IAggregateFrontendSyncState, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          getState({
            aggregateCommandChains: this.env.AGGREGATE_COMMAND_CHAIN,
            db: this.db,
            key: this.key,
            requested: props,
            schema: this.schema,
          }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      this.runScheduledWork().then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async getProjectionReadiness(): Promise<
    IEncodedResult<
      Readonly<{
        systemId: string;
        aggregateIndex: number;
        frontendIndex: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getProjectionReadiness({ db: this.db, key: this.key }).pipe(encodeRpc),
    );
  }

  async runScheduledWork(): Promise<
    IEncodedResult<Readonly<{ pending: boolean }>, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      runScheduledWork({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        finalizedCommandChains:
          this.env.AGGREGATE_FRONTEND_FINALIZED_COMMAND_CHAIN,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    return managedRuntime.runPromise(
      alarm({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        finalizedCommandChains:
          this.env.AGGREGATE_FRONTEND_FINALIZED_COMMAND_CHAIN,
        key: this.key,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
