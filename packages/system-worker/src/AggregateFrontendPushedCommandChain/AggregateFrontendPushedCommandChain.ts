import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import type {
  IAggregateFrontendPushedCommand,
  IFrontendDelta,
} from '@zerospin/core/session/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { Effect, Semaphore } from 'effect';

import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { aggregateFrontendPushedCommandChainDbConfig } from './AggregateFrontendPushedCommandChainDbConfig.js';
import { alarm } from './alarm/alarm.js';
import { getCommands } from './getCommands/getCommands.js';
import { pushCommand } from './pushCommand/pushCommand.js';
import { runScheduledWork } from './runScheduledWork/runScheduledWork.js';

const aggregateFrontendPushedCommandChainFixedDORepoConfig =
  makeFixedDORepoConfig({
    abbreviation: systemWorkerAbbreviations.aggregateFrontendPushedCommandChain,
    repoType: 'AggregateFrontendPushedCommandChain',
    namePattern: RoutePattern.parse(
      '/:systemId/:aggregateId/:aggregateName/:userId/:frontendName',
    ),
    managedRuntime,
    getDbConfig: Effect.fn('AggregateFrontendPushedCommandChain.getDbConfig')(
      function* () {
        yield* Effect.void;
        return aggregateFrontendPushedCommandChainDbConfig;
      },
    ),
  });

export class AggregateFrontendPushedCommandChain extends makeFixedDORepo({
  fixedDORepoConfig: aggregateFrontendPushedCommandChainFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    aggregateFrontendPushedCommandChainFixedDORepoConfig;

  private readonly deliveryQueue = makeDeliveryQueue({
    storage: this.ctx.storage,
  });
  private readonly admissionSemaphore = Effect.runSync(Semaphore.make(1));

  async pushCommand(props: {
    command: IEncodedCommand<
      IChainedCommand<ISessionCommand, IFrontendDelta> &
        Readonly<{ sessionIndex: number; pushIndex: null }>
    >;
  }): Promise<
    IEncodedResult<
      IEncodedCommand<IAggregateFrontendPushedCommand>,
      IAnyErrorJson
    >
  > {
    const result = await managedRuntime.runPromise(
      pushCommand({
        ...props,
        admissionSemaphore: this.admissionSemaphore,
        aggregateCommandChains: this.env.AGGREGATE_COMMAND_CHAIN,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        key: this.key,
        materializedAggregateFrontendRepos:
          this.env.MATERIALIZED_AGGREGATE_FRONTEND_REPO,
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

  async getCommands(props: { afterPushIndex: number | null }): Promise<
    IEncodedResult<
      Readonly<{
        commands: readonly IEncodedCommand<IAggregateFrontendPushedCommand>[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getCommands({ afterPushIndex: props.afterPushIndex, db: this.db }).pipe(
        encodeRpc,
      ),
    );
  }

  async runScheduledWork(): Promise<
    IEncodedResult<Readonly<{ pending: boolean }>, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      runScheduledWork({
        aggregateCommandChains: this.env.AGGREGATE_COMMAND_CHAIN,
        db: this.db,
        deliveryQueue: this.deliveryQueue,
        materializedAggregateFrontendRepos:
          this.env.MATERIALIZED_AGGREGATE_FRONTEND_REPO,
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
        materializedAggregateFrontendRepos:
          this.env.MATERIALIZED_AGGREGATE_FRONTEND_REPO,
        storage: this.ctx.storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}
