import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAsyncCommand } from '@zerospin/core/contracts/AsyncCommandSchema';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, type IZerospinErrorJson } from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Semaphore } from 'effect';

import { verifyPreparedAsyncCommand } from '../asyncOperations/readPreparedAsyncCommand.js';
import {
  makeFanoutQueue,
  type IFanoutRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { ServiceVersionRepo } from '../ServiceVersionRepo/ServiceVersionRepo.js';
import { serviceVersionRepoFixedDORepoConfig } from '../ServiceVersionRepo/serviceVersionRepoFixedDORepoConfig.js';

import { prepareServiceAdmission } from './admitServiceCommand/admitServiceCommand.js';
import { retainServiceCommand } from './admitServiceCommand/retainServiceCommand.js';
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
  implements IFanoutRepo<'admittedCommandsFanout', ServiceVersionRepo>
{
  static override readonly fixedDORepoConfig = serviceChainFixedDORepoConfig;
  readonly #admissionWrites = Effect.runSync(Semaphore.make(1));
  readonly #admittedCommandsFanout = makeFanoutQueue({
    concurrency: 100,
    name: 'admittedCommandsFanout',
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
  get admittedCommandsFanout() {
    return this.#admittedCommandsFanout;
  }
  /** Establish the base and authored materializer before serving this activation. */
  override onDOActivation() {
    return onDOActivation({
      db: this.db,
      key: this.key,
      alarms: this.alarmRegistry,
    });
  }
  async admitAsyncCommand(props: {
    ownerVersion: string;
    command: IAsyncCommand;
  }) {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        const repo = yield* ServiceVersionRepo.getRepo({
          key: {
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
            serviceVersion: props.ownerVersion,
          },
        });
        const expected = yield* makeAsync<
          Awaited<ReturnType<ServiceVersionRepo['getPreparedAsyncCommand']>>
        >(() =>
          repo.getPreparedAsyncCommand({ commandId: props.command.id }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        const command = yield* verifyPreparedAsyncCommand(
          expected,
          props.command,
        );
        return yield* this.#admissionWrites.withPermits(1)(
          Effect.gen({ self: this }, function* () {
            const prepared = yield* prepareServiceAdmission({
              command,
              trustedAsync: true,
              db: this.db,
              key: this.key,
            });
            return yield* this.#admittedCommandsFanout.drainAfter(() =>
              retainServiceCommand({ ...prepared, db: this.db }),
            );
          }),
        );
      }).pipe(
        Effect.mapError(error =>
          makeZerospinError({
            code: 'async-admission-failed',
            cause: String(error),
          }),
        ),
        Effect.provide(AsyncLive),
        makeRpcEnvelope,
      ),
    );
  }

  async admitServiceCommand(props: {
    command: IEncodedCommand<IServiceCommand>;
  }): Promise<IRpcEnvelope<IServiceAdmissionReceipt, IZerospinErrorJson>> {
    return config.system.runtime.runPromise(
      this.#admissionWrites
        .withPermits(1)(
          Effect.gen({ self: this }, function* () {
            const prepared = yield* prepareServiceAdmission({
              command: props.command,
              db: this.db,
              key: this.key,
            });
            return yield* this.#admittedCommandsFanout.drainAfter(() =>
              retainServiceCommand({ ...prepared, db: this.db }),
            );
          }),
        )
        .pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
}
