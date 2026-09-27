import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, type IZerospinErrorJson } from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { eq, isNotNull } from 'drizzle-orm';
import { Effect, Schema, Semaphore } from 'effect';

import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';
import { ServiceActorVersionChain } from '../ServiceActorVersionChain/ServiceActorVersionChain.js';
import { serviceActorVersionChainDbConfig } from '../ServiceActorVersionChain/serviceActorVersionChainDbConfig.js';
import { ServiceChain } from '../ServiceChain/ServiceChain.js';
import { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';

import { makeServiceAutomations } from './automations/makeServiceAutomations.js';
import { catchup } from './catchup/catchup.js';
import { execute } from './execute/execute.js';
import { getProjectionReadiness } from './getProjectionReadiness/getProjectionReadiness.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';
import { onDOActivation } from './onDOActivation/onDOActivation.js';
import { serviceActorVersionRepoDbConfig } from './serviceActorVersionRepoDbConfig.js';
import { serviceActorVersionRepoFixedDORepoConfig } from './serviceActorVersionRepoFixedDORepoConfig.js';
export class ServiceActorVersionRepo extends makeFixedDORepo({
  namespaceBinding: 'SERVICE_ACTOR_VERSION_REPO',
  fixedDORepoConfig: serviceActorVersionRepoFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig =
    serviceActorVersionRepoFixedDORepoConfig;
  // Serialize confirmed groups and recovery; programs hold no SQL transaction.
  readonly #automationGate = Semaphore.makeUnsafe(1);
  readonly #serviceAutomationCatchup = this.alarmRegistry.register(
    'serviceAutomationCatchup',
    Effect.gen({ self: this }, function* () {
      yield* this.#automations
        .resume()
        .pipe(this.#automationGate.withPermits(1));
      yield* onDOActivation({ repo: this });
      yield* this.alarmRegistry.release('serviceAutomationCatchup');
    }).pipe(
      Effect.mapError(error =>
        makeZerospinError({
          code: 'service-automation-catchup-failed',
          cause: String(error),
        }),
      ),
    ),
  );
  override onDOActivation() {
    void this.#serviceAutomationCatchup;
    // Construction validated the private tuple; registration owns its recovery alarm.
    if (this.key.actorName === '__service') return Effect.void;
    return onDOActivation({ repo: this });
  }

  readonly #automations = makeServiceAutomations({
    db: this.db,
    key: this.key,
    stageOutputs: serviceIndex =>
      this.#pendingCommandsOutbox
        .drainAfter(() =>
          this.#automations.stage(serviceIndex).pipe(Effect.scoped),
        )
        .pipe(
          Effect.mapError(error =>
            makeZerospinError({
              code: 'service-automation-staging-failed',
              cause: String(error),
            }),
          ),
        ),
  });

  readonly #pendingCommandsOutbox = makeOutboxQueue({
    indexColumnName: 'stageIndex',
    name: 'servicePendingCommandsOutbox',
    db: this.db,
    outboxTable: serviceActorVersionRepoDbConfig.schema.pendingCommands,
    alarmRegistry: this.alarmRegistry,
    retention: 'retain',
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* ServiceChain.getRepo({
          key: {
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
          },
        });
        for (const pending of rows) {
          const commandRowId = yield* Schema.decodeUnknownEffect(
            Schema.TemplateLiteral(['row_', Schema.String]),
          )(pending.commandRowId);
          const runs = serviceActorVersionRepoDbConfig.schema.automationRuns;
          const invocation = this.db
            .select()
            .from(runs)
            .where(eq(runs.outputCommandRowId, commandRowId))
            .get();
          if (invocation === undefined) {
            return yield* makeZerospinError('service-pending-command-missing');
          }
          yield* makeAsync(() =>
            chain.executeAutomationCommand({
              serviceVersion: this.key.serviceVersion,
              serviceIndex: invocation.serviceIndex,
              automationName: invocation.automationName,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
        }
      }).pipe(
        Effect.mapError(error =>
          makeZerospinError({
            code: 'service-command-delivery-failed',
            cause: String(error),
          }),
        ),
      ),
  });

  async registerAutomations(props: { startIndex: number }) {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        if (
          this.key.actorName !== '__service' ||
          this.key.actorVersion !== this.key.serviceVersion ||
          this.key.actorPath !== '/'
        ) {
          return yield* makeZerospinError('service-automation-actor-required');
        }
        const table = serviceActorVersionRepoDbConfig.schema.automationState;
        this.db
          .insert(table)
          .values({ id: 1, startIndex: props.startIndex })
          .onConflictDoNothing()
          .run();
        yield* this.alarmRegistry.hold('serviceAutomationCatchup');
      }).pipe(makeRpcEnvelope),
    );
  }

  async getAutomationOutput(props: {
    serviceIndex: number;
    automationName: string;
  }): Promise<
    IRpcEnvelope<IEncodedCommand<IServiceCommand>, IZerospinErrorJson>
  > {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        if (this.key.actorName !== '__service') {
          return yield* makeZerospinError('service-automation-actor-required');
        }
        const runs = serviceActorVersionRepoDbConfig.schema.automationRuns;
        const run = this.db
          .select()
          .from(runs)
          .where(eq(runs.serviceIndex, props.serviceIndex))
          .all()
          .find(row => row.automationName === props.automationName);
        if (
          run?.programStatus !== 'succeeded' ||
          run.outputCommandRowId === null
        ) {
          return yield* makeZerospinError('automation-output-not-found');
        }
        const commandRowId = yield* Schema.decodeUnknownEffect(
          Schema.TemplateLiteral(['row_', Schema.String]),
        )(run.outputCommandRowId);
        const row = this.db
          .select()
          .from(serviceActorVersionRepoDbConfig.schema.commands)
          .where(
            eq(
              serviceActorVersionRepoDbConfig.schema.commands.rowId,
              commandRowId,
            ),
          )
          .get();
        if (row === undefined || row.automationName !== props.automationName) {
          return yield* makeZerospinError('automation-output-not-found');
        }
        return yield* Schema.decodeUnknownEffect(EncodedServiceCommandSchema)({
          id: row.id,
          commandName: row.commandName,
          contractVersion: row.contractVersion,
          payload: row.payload,
          serviceName: row.serviceName,
          serviceVersion: row.serviceVersion,
        });
      }).pipe(makeRpcEnvelope),
    );
  }

  async flushAutomationOutputs(props: {
    throughStageIndex: number;
  }): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    return config.system.runtime.runPromise(
      Effect.gen({ self: this }, function* () {
        if (this.key.actorName !== '__service') {
          return yield* makeZerospinError('service-automation-actor-required');
        }
        yield* this.#pendingCommandsOutbox.drain(props.throughStageIndex);
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }

  readonly #actorCommandsOutbox = makeOutboxQueue({
    indexColumnName: 'actorServiceIndex',
    name: 'actorCommandsOutbox',
    db: this.db,
    outboxTable: serviceActorVersionRepoDbConfig.schema.commands,
    where: isNotNull(
      serviceActorVersionRepoDbConfig.schema.commands.actorServiceIndex,
    ),
    alarmRegistry: this.alarmRegistry,
    retention: 'retain',
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        const chain = yield* ServiceActorVersionChain.getRepo({
          key: this.key,
        });
        const receiver = yield* makeAsync(() => chain.actorCommandsSubscriber);
        const output = yield* Effect.forEach(rows, row =>
          Effect.gen(function* () {
            const decoded =
              yield* serviceActorVersionRepoDbConfig.tables.commands.decodeRow(
                row,
              );
            if (
              decoded.actorServiceIndex === null ||
              decoded.serviceHash === null ||
              decoded.actorDelta === null
            ) {
              return yield* makeZerospinError(
                'service-actor-output-incomplete',
              );
            }
            return yield* serviceActorVersionChainDbConfig.tables.commands.encodeRow(
              {
                ...decoded,
                acknowledgedAt: null,
                lastDeliveryFailure: null,
              },
            );
          }),
        );
        yield* makeAsync(() => receiver.receive(output)).pipe(
          Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        );
      }).pipe(
        Effect.mapError(error =>
          makeZerospinError({
            code: 'service-actor-delivery-failed',
            cause: String(error),
          }),
        ),
      ),
  });
  /*
   * Exposes the already bound actor-command capability from ServiceActorVersionRepo.
   *
   * 1. Return the bound capability.
   */
  get actorCommandsOutbox() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#actorCommandsOutbox;
  }
  /*
   * Bind one selected service source to the replica's durable projection cursor.
   * Pulled and pushed pages share synchronous replay transactions and an output alarm.
   */
  executionResultsFanoutSubscriber(
    sourceKey: Parameters<typeof ServiceVersionChain.getRepo>[0]['key'],
  ): ReturnType<
    typeof makeFanoutSubscriber<
      'executionResultsFanout',
      typeof sourceKey,
      typeof this.key,
      Parameters<typeof execute>[0]['rows'][number]
    >
  > {
    if (
      sourceKey.systemId !== this.key.systemId ||
      sourceKey.serviceName !== this.key.serviceName ||
      sourceKey.serviceVersion !== this.key.serviceVersion
    ) {
      throw makeZerospinError({
        code: 'fanout-source-key-mismatch',
        message: 'Service source does not match the bound replica',
      });
    }
    return makeFanoutSubscriber({
      name: 'executionResultsFanout',
      sourceKey,
      key: this.key,
      getRepo: ServiceVersionChain.getRepo,
      getCurrentIndex: () =>
        this.db
          .select()
          .from(serviceActorVersionRepoDbConfig.schema.actorState)
          .where(eq(serviceActorVersionRepoDbConfig.schema.actorState.id, 1))
          .get()?.serviceIndex ?? 0,
      receive: (
        delivery: IFanoutDelivery<
          Parameters<typeof execute>[0]['rows'][number]
        >,
      ) =>
        Effect.gen({ self: this }, function* () {
          yield* this.#automations.resume();
          for (const row of delivery.rows) {
            const cursor =
              this.db
                .select()
                .from(serviceActorVersionRepoDbConfig.schema.actorState)
                .where(
                  eq(serviceActorVersionRepoDbConfig.schema.actorState.id, 1),
                )
                .get()?.serviceIndex ?? 0;
            if (row.serviceIndex <= cursor) continue;
            yield* this.#actorCommandsOutbox.drainAfter(() =>
              execute({ rows: [row], db: this.db, key: this.key }),
            );
            yield* this.#automations.run(row.serviceIndex);
          }
        }).pipe(
          this.#automationGate.withPermits(1),
          Effect.mapError(error =>
            makeZerospinError({
              code: 'service-automation-receive-failed',
              cause: String(error),
            }),
          ),
        ),
    });
  }
  /*
   * Snapshot reads catch this replica up through a bounded VSC tip, then enroll
   * at the committed projection cursor. Replay uses the live receive operation
   * and holds a durable alarm lease for the outputs it creates.
   *
   * 1. Run the bound domain operation.
   */
  async catchup(props?: { throughServiceIndex?: number }) {
    // 1 — run catchup with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      catchup({
        ...props,
        subscriber: this.executionResultsFanoutSubscriber(this.key),
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  /*
   * Session snapshot reads capture projected state and resolved command IDs
   * together, then ensure the captured cursor is durably published to FSC.
   * Publication waits occur after the synchronous capture transaction completes.
   *
   * 1. Run the bound domain operation.
   */
  async getSnapshot(props: Parameters<typeof getSnapshot>[0]['requested']) {
    // 1 — run getSnapshot with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getSnapshot({
        db: this.db,
        key: this.key,
        requested: props,
        actorCommandsOutbox: this.#actorCommandsOutbox,
        subscriber: this.executionResultsFanoutSubscriber(this.key),
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
  /*
   * Replica callers inspect the locally committed projection cursor.
   * This reader reports local progress; publication durability is checked separately
   * by the snapshot path.
   *
   * 1. Run the bound domain operation.
   */
  async getProjectionReadiness() {
    // 1 — run getProjectionReadiness with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getProjectionReadiness({ db: this.db, key: this.key }).pipe(
        makeRpcEnvelope,
      ),
    );
  }
}
