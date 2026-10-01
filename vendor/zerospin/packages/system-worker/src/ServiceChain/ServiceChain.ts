import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { type IZerospinErrorJson } from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Semaphore } from 'effect';

import {
  makeFanoutQueue,
  type IFanoutRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { ServiceVersionRepo } from '../ServiceVersionRepo/ServiceVersionRepo.js';
import { serviceVersionRepoFixedDORepoConfig } from '../ServiceVersionRepo/serviceVersionRepoFixedDORepoConfig.js';

import {
  prepareServiceAdmission,
  retainServiceCommand,
} from './admitServiceCommand/admitServiceCommand.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';
import { serviceChainFixedDORepoConfig } from './serviceChainFixedDORepoConfig.js';

type IServiceAdmissionReceipt = Effect.Success<
  ReturnType<typeof retainServiceCommand>
>;

export class ServiceChain
  extends makeFixedDORepo({
    namespaceBinding: 'SERVICE_CHAIN',
    fixedDORepoConfig: serviceChainFixedDORepoConfig,
  })
  implements IFanoutRepo<'admissionResultsFanout', ServiceVersionRepo>
{
  static override readonly fixedDORepoConfig = serviceChainFixedDORepoConfig;
  readonly #admissionWrites = Effect.runSync(Semaphore.make(1));
  readonly #admissionResultsFanout = makeFanoutQueue({
    concurrency: 100,
    name: 'admissionResultsFanout',
    db: this.db,
    key: this.key,
    alarmRegistry: this.alarmRegistry,
    schema: this.schema,
    subscribersTableName: 'serviceSubscribers',
    subscriberNameUtils: serviceVersionRepoFixedDORepoConfig.nameUtils,
    entriesTableName: 'commands',
    indexColumnName: 'serviceIndex',
    getRepo: ServiceVersionRepo.getRepo,
    subscribersWhere: [
      eq(serviceChainDbConfig.schema.serviceSubscribers.active, true),
    ],
  });
  get admissionResultsFanout() {
    return this.#admissionResultsFanout;
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
  }): Promise<IRpcEnvelope<IServiceAdmissionReceipt, IZerospinErrorJson>> {
    return config.system.runtime.runPromise(
      this.#admit(props.command).pipe(
        Effect.provide(AsyncLive),
        makeRpcEnvelope,
      ),
    );
  }

  /** Machine-owned capability; binding and target are checked before admission. */
  async submitMachineCommand(props: {
    machineName: string;
    bindingName: string;
    mode: 'push' | 'execute';
    command: IEncodedCommand<IServiceCommand>;
  }) {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        const receipt = yield* this.#admit(props.command, {
          machineName: props.machineName,
          bindingName: props.bindingName,
          mode: props.mode,
        });
        if (props.mode === 'push') {
          return { commandId: receipt.id, accepted: true as const };
        }
        const repo = yield* ServiceVersionRepo.getRepo({
          key: {
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
            serviceVersion: props.command.serviceVersion,
          },
        });
        return yield* makeAsync<
          Awaited<ReturnType<ServiceVersionRepo['execute']>>
        >(() => repo.execute({ serviceIndex: receipt.serviceIndex })).pipe(
          Effect.flatMap(readRpcEnvelope),
        );
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }

  readonly #admit = (
    command: IEncodedCommand<IServiceCommand>,
    machine?: Readonly<{
      machineName: string;
      bindingName: string;
      mode: 'push' | 'execute';
    }>,
  ) =>
    this.#admissionWrites.withPermits(1)(
      Effect.gen({ self: this }, function* () {
        const prepared = yield* prepareServiceAdmission({
          command,
          ...(machine === undefined ? {} : { machine }),
          db: this.db,
          key: this.key,
        });
        return yield* this.#admissionResultsFanout.drainAfter(() =>
          retainServiceCommand({ ...prepared, db: this.db }),
        );
      }),
    );
}
