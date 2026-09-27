import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, type IZerospinErrorJson } from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { desc, eq } from 'drizzle-orm';
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
      this.#admit(props.command, false).pipe(
        Effect.provide(AsyncLive),
        makeRpcEnvelope,
      ),
    );
  }

  /** Resolve a saved output from its internal owner before retaining it. */
  async executeAutomationCommand(props: {
    serviceVersion: string;
    serviceIndex: number;
    automationName: string;
  }): Promise<IRpcEnvelope<IServiceAdmissionReceipt, IZerospinErrorJson>> {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { ServiceActorVersionRepo } = yield* Effect.promise(
          () => import('../ServiceActorVersionRepo/ServiceActorVersionRepo.js'),
        );
        const actor = yield* ServiceActorVersionRepo.getRepo({
          key: {
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
            serviceVersion: props.serviceVersion,
            actorName: '__service',
            actorVersion: props.serviceVersion,
            actorPath: '/',
          },
        });
        const command = yield* makeAsync(() =>
          actor.getAutomationOutput({
            serviceIndex: props.serviceIndex,
            automationName: props.automationName,
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        if (
          command.serviceName !== this.key.serviceName ||
          command.serviceVersion !== props.serviceVersion
        ) {
          return yield* makeZerospinError('service-automation-target-mismatch');
        }
        return yield* this.#admit(command, true);
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }

  readonly #admit = (
    command: IEncodedCommand<IServiceCommand>,
    automationOutput: boolean,
  ) =>
    this.#admissionWrites.withPermits(1)(
      Effect.gen({ self: this }, function* () {
        const prepared = yield* prepareServiceAdmission({
          command,
          automationOutput,
          db: this.db,
          key: this.key,
        });
        const service =
          config.system.services[this.key.serviceName]?.[
            command.serviceVersion
          ];
        if (
          service !== undefined &&
          Object.keys(service.automations).length > 0
        ) {
          const startIndex =
            this.db
              .select({
                serviceIndex: serviceChainDbConfig.schema.commands.serviceIndex,
              })
              .from(serviceChainDbConfig.schema.commands)
              .orderBy(desc(serviceChainDbConfig.schema.commands.serviceIndex))
              .limit(1)
              .get()?.serviceIndex ?? 0;
          const { ServiceActorVersionRepo } = yield* Effect.promise(
            () =>
              import('../ServiceActorVersionRepo/ServiceActorVersionRepo.js'),
          );
          const actor = yield* ServiceActorVersionRepo.getRepo({
            key: {
              systemId: this.key.systemId,
              serviceName: this.key.serviceName,
              serviceVersion: command.serviceVersion,
              actorName: '__service',
              actorVersion: command.serviceVersion,
              actorPath: '/',
            },
          });
          yield* makeAsync(() =>
            actor.registerAutomations({ startIndex }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
        }
        return yield* this.#admissionResultsFanout.drainAfter(() =>
          retainServiceCommand({ ...prepared, db: this.db }),
        );
      }),
    );
}
