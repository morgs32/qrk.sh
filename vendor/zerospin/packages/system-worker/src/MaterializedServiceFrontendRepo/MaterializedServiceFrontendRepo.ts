import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
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

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { getServiceCommandChain } from '../ServiceCommandChain/getServiceCommandChain/getServiceCommandChain.js';
import { ServiceFrontendFinalizedCommandChain } from '../ServiceFrontendFinalizedCommandChain/ServiceFrontendFinalizedCommandChain.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { alarm } from './alarm/alarm.js';
import { catchup } from './catchup/catchup.js';
import { execute } from './execute/execute.js';
import { getState } from './getState/getState.js';
import {
  makeMaterializedServiceFrontendRepoDbConfig,
  materializedServiceFrontendRepoDrizzleSchemas,
} from './MaterializedServiceFrontendRepoDbConfig.js';
import { runScheduledWork } from './runScheduledWork/runScheduledWork.js';

const materializedServiceFrontendRepoFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.materializedServiceFrontendRepo,
  repoType: 'MaterializedServiceFrontendRepo',
  namePattern: RoutePattern.parse(
    '/:systemId/:serviceName/:userId/:frontendName',
  ),
  managedRuntime,
  getDbConfig: Effect.fn('MaterializedServiceFrontendRepo.getDbConfig')(
    function* ({ key }) {
      const service = yield* getByKeyOrThrow({
        record: system.services,
        key: key.serviceName,
        recordKind: 'services',
      });
      const frontendBinding = yield* getByKeyOrThrow({
        record: service.frontends,
        key: key.frontendName,
        recordKind: `frontends owned by service ${key.serviceName}`,
      });
      return yield* makeMaterializedServiceFrontendRepoDbConfig({
        serviceModels: service.models,
        frontendModels: frontendBinding.controller.models,
      });
    },
  ),
});

export class MaterializedServiceFrontendRepo extends makeFixedDORepo({
  fixedDORepoConfig: materializedServiceFrontendRepoFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    materializedServiceFrontendRepoFixedDORepoConfig;

  private readonly executionSemaphore = Effect.runSync(Semaphore.make(1));
  private readonly finalizedCommandChain =
    this.env.SERVICE_FRONTEND_FINALIZED_COMMAND_CHAIN.getByName(
      managedRuntime.runSync(
        ServiceFrontendFinalizedCommandChain.fixedDORepoConfig.nameUtils.makeName(
          this.key,
        ),
      ),
    );

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    ctx.blockConcurrencyWhile(() =>
      managedRuntime.runPromise(
        Effect.gen({ self: this }, function* () {
          yield* Effect.promise(() => this.fixedDORepoInitialization);
          const serviceCommandChain = yield* getServiceCommandChain({
            key: {
              systemId: this.key.systemId,
              serviceName: this.key.serviceName,
            },
          });
          const currentServiceIndex =
            this.db
              .select()
              .from(
                materializedServiceFrontendRepoDrizzleSchemas.materializationState,
              )
              .where(
                eq(
                  materializedServiceFrontendRepoDrizzleSchemas
                    .materializationState.id,
                  1,
                ),
              )
              .get()?.serviceIndex ?? 0;
          yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              serviceCommandChain.subscribeMaterializedServiceFrontend({
                currentServiceIndex:
                  currentServiceIndex === 0 ? null : currentServiceIndex,
                materializedServiceFrontendRepoName: this.name,
                userId: this.key.userId,
                frontendName: this.key.frontendName,
              }),
            ZerospinError.catch({
              code: 'materialized-service-frontend-subscription-rpc-failed',
              message: `Failed to subscribe ${this.name} before catch-up`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* this.executionSemaphore.withPermits(1)(
            catchup({
              db: this.db,
              key: this.key,
              serviceFrontendRepoSchema: this.schema,
              storage: this.ctx.storage,
              throughServiceIndex: undefined,
            }),
          );
          const caughtUpServiceIndex =
            this.db
              .select()
              .from(
                materializedServiceFrontendRepoDrizzleSchemas.materializationState,
              )
              .where(
                eq(
                  materializedServiceFrontendRepoDrizzleSchemas
                    .materializationState.id,
                  1,
                ),
              )
              .get()?.serviceIndex ?? 0;
          yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              serviceCommandChain.subscribeMaterializedServiceFrontend({
                currentServiceIndex:
                  caughtUpServiceIndex === 0 ? null : caughtUpServiceIndex,
                materializedServiceFrontendRepoName: this.name,
                userId: this.key.userId,
                frontendName: this.key.frontendName,
              }),
            ZerospinError.catch({
              code: 'materialized-service-frontend-subscription-ack-rpc-failed',
              message: `Failed to acknowledge catch-up for ${this.name}`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
  }

  async execute(props: {
    command: Schema.Schema.Type<typeof ServiceChainedCommandSchema>;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          execute({
            command: props.command,
            db: this.db,
            key: this.key,
            serviceFrontendRepoSchema: this.schema,
            storage: this.ctx.storage,
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

  async catchup(props?: {
    throughServiceIndex?: number;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          catchup({
            db: this.db,
            key: this.key,
            serviceFrontendRepoSchema: this.schema,
            storage: this.ctx.storage,
            throughServiceIndex: props?.throughServiceIndex,
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
    systemId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  }) {
    return managedRuntime.runPromise(
      getState({ db: this.db, key: this.key, requested: props }).pipe(
        encodeRpc,
      ),
    );
  }

  async runScheduledWork(): Promise<
    IEncodedResult<Readonly<{ pending: boolean }>, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      runScheduledWork({
        db: this.db,
        finalizedCommandChain: this.finalizedCommandChain,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    return managedRuntime.runPromise(
      alarm({
        db: this.db,
        finalizedCommandChain: this.finalizedCommandChain,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
