import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { Effect, Semaphore, type Schema } from 'effect';

import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { alarm } from './alarm/alarm.js';
import { finalizeServiceCommand } from './finalizeServiceCommand/finalizeServiceCommand.js';
import { getCommands } from './getCommands/getCommands.js';
import { runScheduledWork } from './runScheduledWork/runScheduledWork.js';
import { serviceCommandChainDbConfig } from './ServiceCommandChainDbConfig.js';
import { subscribeAggregate } from './subscribeAggregate/subscribeAggregate.js';
import { subscribeMaterializedService } from './subscribeMaterializedService/subscribeMaterializedService.js';
import { subscribeMaterializedServiceFrontend } from './subscribeMaterializedServiceFrontend/subscribeMaterializedServiceFrontend.js';

const serviceCommandChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceCommandChain,
  repoType: 'ServiceCommandChain',
  namePattern: RoutePattern.parse('/:systemId/:serviceName'),
  managedRuntime,
  getDbConfig: Effect.fn('ServiceCommandChain.getDbConfig')(function* () {
    yield* Effect.void;
    return serviceCommandChainDbConfig;
  }),
});

export class ServiceCommandChain extends makeFixedDORepo({
  fixedDORepoConfig: serviceCommandChainFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    serviceCommandChainFixedDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    storage: this.ctx.storage,
  });
  private readonly admissionSemaphore = Effect.runSync(Semaphore.make(1));

  async finalizeServiceCommand(props: {
    command: IEncodedCommand<IServiceCommand>;
  }): Promise<
    IEncodedResult<
      Schema.Schema.Type<typeof ServiceChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    const result = await managedRuntime.runPromise(
      finalizeServiceCommand({
        admissionSemaphore: this.admissionSemaphore,
        aggregateCommandChains: this.env.AGGREGATE_COMMAND_CHAIN,
        command: props.command,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        materializedServiceFrontendRepos:
          this.env.MATERIALIZED_SERVICE_FRONTEND_REPO,
        materializedServiceRepos: this.env.MATERIALIZED_SERVICE_REPO,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
    this.ctx.waitUntil(
      this.runScheduledWork().then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async subscribeMaterializedService(props: {
    currentServiceIndex: number | null;
    materializedServiceRepoName: string;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      subscribeMaterializedService({ ...props, db: this.db }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      this.runScheduledWork().then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async getCommands(props: { afterServiceIndex: number | null }): Promise<
    IEncodedResult<
      Readonly<{
        commands: readonly Schema.Schema.Type<
          typeof ServiceChainedCommandSchema
        >[];
        tip: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getCommands({
        afterServiceIndex: props.afterServiceIndex,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }

  async subscribeAggregate(props: {
    aggregateCommandChainName: string;
    aggregateId: string;
    aggregateName: string;
    currentServiceIndex: number | null;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      subscribeAggregate({ ...props, db: this.db }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      this.runScheduledWork().then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async subscribeMaterializedServiceFrontend(props: {
    currentServiceIndex: number | null;
    frontendName: string;
    materializedServiceFrontendRepoName: string;
    userId: string;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      subscribeMaterializedServiceFrontend({ ...props, db: this.db }).pipe(
        encodeRpc,
      ),
    );
    this.ctx.waitUntil(
      this.runScheduledWork().then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async runScheduledWork(): Promise<
    IEncodedResult<Readonly<{ pending: boolean }>, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      runScheduledWork({
        aggregateCommandChains: this.env.AGGREGATE_COMMAND_CHAIN,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        materializedServiceFrontendRepos:
          this.env.MATERIALIZED_SERVICE_FRONTEND_REPO,
        materializedServiceRepos: this.env.MATERIALIZED_SERVICE_REPO,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    return managedRuntime.runPromise(
      alarm({
        aggregateCommandChains: this.env.AGGREGATE_COMMAND_CHAIN,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        materializedServiceFrontendRepos:
          this.env.MATERIALIZED_SERVICE_FRONTEND_REPO,
        materializedServiceRepos: this.env.MATERIALIZED_SERVICE_REPO,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
