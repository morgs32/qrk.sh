import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
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
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { authorizeServiceFrontend } from './authorizeServiceFrontend/authorizeServiceFrontend.js';
import { catchup } from './catchup/catchup.js';
import { execute } from './execute/execute.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getReplicatedResources } from './getReplicatedResources/getReplicatedResources.js';
import { getServiceFrontendSnapshot } from './getServiceFrontendSnapshot/getServiceFrontendSnapshot.js';
import {
  makeMaterializedServiceRepoDbConfig,
  materializedServiceRepoDrizzleSchemas,
} from './MaterializedServiceRepoDbConfig.js';

const materializedServiceRepoFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.materializedServiceRepo,
  repoType: 'MaterializedServiceRepo',
  namePattern: RoutePattern.parse('/:systemId/:serviceName'),
  managedRuntime,
  getDbConfig: Effect.fn('MaterializedServiceRepo.getDbConfig')(function* ({
    key,
  }) {
    const service = system.services[key.serviceName];
    if (service === undefined) {
      return yield* new ZerospinError({
        code: 'materialized-service-service-not-found',
        message: `Service ${key.serviceName} was not found`,
      });
    }
    return makeMaterializedServiceRepoDbConfig({ models: service.models });
  }),
});

export class MaterializedServiceRepo extends makeFixedDORepo({
  fixedDORepoConfig: materializedServiceRepoFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    materializedServiceRepoFixedDORepoConfig;
  private readonly executionSemaphore = Effect.runSync(Semaphore.make(1));

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
              .from(materializedServiceRepoDrizzleSchemas.materializationState)
              .where(
                eq(
                  materializedServiceRepoDrizzleSchemas.materializationState.id,
                  1,
                ),
              )
              .get()?.serviceIndex ?? 0;
          yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              serviceCommandChain.subscribeMaterializedService({
                currentServiceIndex:
                  currentServiceIndex === 0 ? null : currentServiceIndex,
                materializedServiceRepoName: this.name,
              }),
            ZerospinError.catch({
              code: 'materialized-service-subscription-rpc-failed',
              message: `Failed to subscribe ${this.name} before catch-up`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* this.executionSemaphore.withPermits(1)(
            catchup({
              db: this.db,
              serviceName: this.key.serviceName,
              systemId: this.key.systemId,
              throughServiceIndex: undefined,
            }),
          );
          const caughtUpServiceIndex =
            this.db
              .select()
              .from(materializedServiceRepoDrizzleSchemas.materializationState)
              .where(
                eq(
                  materializedServiceRepoDrizzleSchemas.materializationState.id,
                  1,
                ),
              )
              .get()?.serviceIndex ?? 0;
          yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              serviceCommandChain.subscribeMaterializedService({
                currentServiceIndex:
                  caughtUpServiceIndex === 0 ? null : caughtUpServiceIndex,
                materializedServiceRepoName: this.name,
              }),
            ZerospinError.catch({
              code: 'materialized-service-subscription-ack-rpc-failed',
              message: `Failed to acknowledge catch-up for ${this.name}`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
  }

  async execute(props: {
    command: Schema.Schema.Type<typeof ServiceChainedCommandSchema>;
  }): Promise<
    IEncodedResult<
      Schema.Schema.Type<typeof ServiceChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          execute({
            command: props.command,
            db: this.db,
            serviceName: this.key.serviceName,
            systemId: this.key.systemId,
          }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async catchup(props?: {
    throughServiceIndex?: number;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      this.executionSemaphore
        .withPermits(1)(
          catchup({
            db: this.db,
            serviceName: this.key.serviceName,
            systemId: this.key.systemId,
            throughServiceIndex: props?.throughServiceIndex,
          }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async executeServiceQuery(props: {
    serviceName: string;
    queryName: string;
    params: unknown;
  }): Promise<IEncodedResult<unknown, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      executeServiceQuery({ ...props, db: this.db }).pipe(encodeRpc),
    );
  }

  async authorizeServiceFrontend(props: {
    serviceName: string;
    frontendName: string;
    userId: string;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      authorizeServiceFrontend({ ...props, db: this.db }).pipe(encodeRpc),
    );
  }

  async getReplicatedResources(props: {
    resources: readonly Readonly<{ modelName: string; resourceId: string }>[];
  }): Promise<
    IEncodedResult<
      Readonly<{
        resources: readonly unknown[];
        serviceIndex: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getReplicatedResources({
        ...props,
        db: this.db,
        serviceName: this.key.serviceName,
      }).pipe(encodeRpc),
    );
  }

  async getServiceFrontendSnapshot(props: { frontendName: string }): Promise<
    IEncodedResult<
      Readonly<{
        resources: readonly IEncodedResourceShape[];
        serviceIndex: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getServiceFrontendSnapshot({
        ...props,
        db: this.db,
        serviceName: this.key.serviceName,
      }).pipe(encodeRpc),
    );
  }
}
