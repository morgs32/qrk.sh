import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import {
  makeFanoutQueue,
  type IFanoutRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { managedRuntime } from '../managedRuntime.js';
import { VersionedServiceRepo } from '../VersionedServiceRepo/VersionedServiceRepo.js';
import { versionedServiceRepoFixedDORepoConfig } from '../VersionedServiceRepo/versionedServiceRepoFixedDORepoConfig.js';

import { admitServiceCommand } from './admitServiceCommand/admitServiceCommand.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import { serviceAdmittedChainDbConfig } from './serviceAdmittedChainDbConfig.js';
import { serviceAdmittedChainFixedDORepoConfig } from './serviceAdmittedChainFixedDORepoConfig.js';

export class ServiceAdmittedChain
  extends makeFixedDORepo({
    namespaceBinding: 'SERVICE_ADMITTED_CHAIN',
    fixedDORepoConfig: serviceAdmittedChainFixedDORepoConfig,
  })
  implements IFanoutRepo<'serviceFanoutQueue', VersionedServiceRepo>
{
  static override readonly fixedDORepoConfig =
    serviceAdmittedChainFixedDORepoConfig;
  readonly #serviceFanoutQueue = makeFanoutQueue({
    concurrency: 100,
    name: 'serviceFanoutQueue',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'serviceSubscribers',
    subscriberNameUtils: versionedServiceRepoFixedDORepoConfig.nameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'fanoutIndex',
    getRepo: VersionedServiceRepo.getRepo,
    subscribersWhere: [
      eq(serviceAdmittedChainDbConfig.schema.serviceSubscribers.active, true),
    ],
  });
  get serviceFanoutQueue() {
    return this.#serviceFanoutQueue;
  }
  /** Establish the base and authored materializer before serving this activation. */
  override onDOActivation() {
    return onDOActivation({
      db: this.db,
      key: this.key,
      alarms: this.alarmRegistry,
    });
  }
  async admitServiceCommand(props: {
    command: IEncodedCommand<IServiceCommand>;
  }): Promise<
    IEncodedResult<{ commandId: string; serviceIndex: number }, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      this.#serviceFanoutQueue
        .drainAfter(() =>
          admitServiceCommand({ ...props, db: this.db, key: this.key }),
        )
        .pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
}
