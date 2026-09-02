import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
  AggregateChainedCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { Effect, Semaphore, type Schema } from 'effect';

import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { aggregateCommandChainDbConfig } from './AggregateCommandChainDbConfig.js';
import { alarm } from './alarm/alarm.js';
import { finalizeAggregateCommand } from './finalizeAggregateCommand/finalizeAggregateCommand.js';
import { getCommands } from './getCommands/getCommands.js';
import { receivePushedCommand } from './receivePushedCommand/receivePushedCommand.js';
import { receiveServiceCommand } from './receiveServiceCommand/receiveServiceCommand.js';
import { runScheduledWork } from './runScheduledWork/runScheduledWork.js';
import { subscribeMaterializedAggregate } from './subscribeMaterializedAggregate/subscribeMaterializedAggregate.js';
import { subscribeMaterializedAggregateFrontend } from './subscribeMaterializedAggregateFrontend/subscribeMaterializedAggregateFrontend.js';
import { subscribeService } from './subscribeService/subscribeService.js';

const aggregateCommandChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.aggregateCommandChain,
  repoType: 'AggregateCommandChain',
  namePattern: RoutePattern.parse('/:systemId/:aggregateId/:aggregateName'),
  managedRuntime,
  getDbConfig: Effect.fn('AggregateCommandChain.getDbConfig')(function* () {
    yield* Effect.void;
    return aggregateCommandChainDbConfig;
  }),
});

export class AggregateCommandChain extends makeFixedDORepo({
  fixedDORepoConfig: aggregateCommandChainFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    aggregateCommandChainFixedDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    storage: this.ctx.storage,
  });
  private readonly admissionSemaphore = Effect.runSync(Semaphore.make(1));

  async finalizeAggregateCommand(props: {
    command: IEncodedCommand<IAggregateCommand>;
  }): Promise<
    IEncodedResult<
      Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    const result = await managedRuntime.runPromise(
      finalizeAggregateCommand({
        command: props.command,
        admissionSemaphore: this.admissionSemaphore,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        materializedAggregateFrontendRepos:
          this.env.MATERIALIZED_AGGREGATE_FRONTEND_REPO,
        materializedAggregateRepos: this.env.MATERIALIZED_AGGREGATE_REPO,
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

  async receiveServiceCommand(props: {
    command: Schema.Schema.Type<typeof ServiceChainedCommandSchema>;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      receiveServiceCommand({
        admissionSemaphore: this.admissionSemaphore,
        command: props.command,
        db: this.db,
        materializedAggregateRepos: this.env.MATERIALIZED_AGGREGATE_REPO,
        serviceCommandChains: this.env.SERVICE_COMMAND_CHAIN,
        storage: this.ctx.storage,
        systemId: this.key.systemId,
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

  async receivePushedCommand(props: {
    command: IEncodedCommand<IAggregateCommand>;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      receivePushedCommand({
        admissionSemaphore: this.admissionSemaphore,
        command: props.command,
        db: this.db,
        key: this.key,
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

  async subscribeMaterializedAggregate(props: {
    currentAggregateIndex: number | null;
    materializedAggregateRepoName: string;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      subscribeMaterializedAggregate({ ...props, db: this.db }).pipe(encodeRpc),
    );
    this.ctx.waitUntil(
      this.runScheduledWork().then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  async subscribeService(props: {
    currentServiceIndex: number | null;
    serviceName: string;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      subscribeService({
        ...props,
        aggregateCommandChainName: this.name,
        aggregateId: this.key.aggregateId,
        aggregateName: this.key.aggregateName,
        db: this.db,
        serviceCommandChains: this.env.SERVICE_COMMAND_CHAIN,
        systemId: this.key.systemId,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getCommands(props: { afterAggregateIndex: number | null }): Promise<
    IEncodedResult<
      Readonly<{
        commands: readonly Schema.Schema.Type<
          typeof AggregateChainedCommandSchema
        >[];
        tip: number | null;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getCommands({
        afterAggregateIndex: props.afterAggregateIndex,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }

  async subscribeMaterializedAggregateFrontend(props: {
    currentAggregateIndex: number | null;
    materializedAggregateFrontendRepoName: string;
    userId: string;
    frontendName: string;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const result = await managedRuntime.runPromise(
      subscribeMaterializedAggregateFrontend({
        ...props,
        aggregateId: this.key.aggregateId,
        aggregateName: this.key.aggregateName,
        db: this.db,
      }).pipe(encodeRpc),
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
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        materializedAggregateFrontendRepos:
          this.env.MATERIALIZED_AGGREGATE_FRONTEND_REPO,
        materializedAggregateRepos: this.env.MATERIALIZED_AGGREGATE_REPO,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async alarm(): Promise<void> {
    return managedRuntime.runPromise(
      alarm({
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        materializedAggregateFrontendRepos:
          this.env.MATERIALIZED_AGGREGATE_FRONTEND_REPO,
        materializedAggregateRepos: this.env.MATERIALIZED_AGGREGATE_REPO,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
