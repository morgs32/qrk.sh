import type { RoutePattern } from '@remix-run/route-pattern';
import type { MatchParams } from '@remix-run/route-pattern/match';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { makeTableProvisioningStatements } from '@zerospin/core/drizzle/provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { IAnyMachineDeclaration } from '@zerospin/core/machine/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import config from 'config';
import { eq, getTableName, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import {
  Cause,
  Effect,
  Exit,
  Schema,
  Semaphore,
  type Fiber,
  type ManagedRuntime,
} from 'effect';
import { isEqual } from 'es-toolkit';

import { AggregateChain } from '../AggregateChain/AggregateChain.js';
import { AggregateVersionChain } from '../AggregateVersionChain/AggregateVersionChain.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { ServiceChain } from '../ServiceChain/ServiceChain.js';
import { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';

import {
  makeMachineDbConfig,
  makeMachineSelectedDbConfig,
} from './machineDbConfig.js';
import {
  applyMachineOccurrenceTx,
  enterMachineStateTx,
} from './machineStateTx.js';
import type {
  IMachineOperation,
  IRuntimeRoute,
  IStateRow,
  IStateValue,
} from './types.js';

type ISourceKind = 'aggregate' | 'service';
type IPage = Readonly<{ rows: readonly unknown[]; lastIndex: number }>;
type IAggregateSourceKey = Readonly<{
  systemId: string;
  aggregateName: string;
  aggregateId: string;
  aggregateVersion: string;
}>;
type IServiceSourceKey = Readonly<{
  systemId: string;
  serviceName: string;
  serviceVersion: string;
}>;
type ISourceKey = IAggregateSourceKey | IServiceSourceKey;
type IMachineDbConfig = ReturnType<typeof makeMachineDbConfig>;
type IMachineRepoClass<
  PATTERN extends string,
  BINDING extends keyof Cloudflare.DORepoNamespaces,
> = ReturnType<
  typeof makeFixedDORepo<PATTERN, IMachineDbConfig, BINDING, unknown>
> & {
  new (
    ctx: DurableObjectState,
    env: Cloudflare.Env,
  ): InstanceType<
    ReturnType<
      typeof makeFixedDORepo<PATTERN, IMachineDbConfig, BINDING, unknown>
    >
  > & {
    machineResultsFanoutSubscriber(sourceKey: ISourceKey): unknown;
    getState(): Promise<unknown>;
    getOperation(props: { revision: number }): Promise<unknown>;
  };
};
const AggregateKeySchema = Schema.Struct({
  systemId: Schema.String,
  aggregateName: Schema.String,
  aggregateId: Schema.String,
  machineName: Schema.String,
});
const ServiceKeySchema = Schema.Struct({
  systemId: Schema.String,
  serviceName: Schema.String,
  machineName: Schema.String,
});
const FrozenCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  mode: Schema.Literals(['push', 'execute']),
  binding: Schema.String,
  targetKind: Schema.Literals(['aggregate', 'service']),
  targetName: Schema.String,
  targetVersion: Schema.String,
  aggregateId: Schema.NullOr(Schema.String),
  claims: Schema.Record(Schema.String, Schema.Unknown),
  commandName: Schema.String,
  contractVersion: Schema.String,
  payload: Schema.String,
});

/** One system-registered machine instance per aggregate or service owner key. */
export function makeMachineRepo<
  const PATTERN extends string,
  BINDING extends keyof Cloudflare.DORepoNamespaces,
>(props: {
  sourceKind: ISourceKind;
  namespaceBinding: BINDING;
  namePattern: RoutePattern<PATTERN>;
  abbreviation: string;
  managedRuntime: ManagedRuntime.ManagedRuntime<unknown, IAnyError>;
  resolveMachine: (key: MatchParams<PATTERN>) => IAnyMachineDeclaration;
}): IMachineRepoClass<PATTERN, BINDING> {
  const {
    sourceKind,
    namespaceBinding,
    namePattern,
    abbreviation,
    managedRuntime,
    resolveMachine,
  } = props;
  const projectionTables = (machine: IAnyMachineDeclaration) => [
    ...Object.values(machine.source.models).map(model =>
      getTableName(model.drizzleSchema),
    ),
    ...Object.values(makeMachineSelectedDbConfig(machine).schema).map(
      getTableName,
    ),
  ];
  const fixedDORepoConfig = makeFixedDORepoConfig<
    PATTERN,
    IMachineDbConfig,
    unknown
  >({
    abbreviation,
    repoType:
      sourceKind === 'aggregate'
        ? 'AggregateMachineRepo'
        : 'ServiceMachineRepo',
    namePattern,
    managedRuntime,
    dbConfig: ({ key }) =>
      Effect.sync(() => makeMachineDbConfig(resolveMachine(key))),
    bootstrap: Effect.fn('MachineRepo.bootstrap')(function* ({
      db,
      schema,
      key,
    }) {
      const machine = resolveMachine(key);
      for (const table of Object.values(
        makeMachineSelectedDbConfig(machine).schema,
      )) {
        for (const statement of makeTableProvisioningStatements(table, {
          foreignKeys: false,
        })) {
          db.run(sql.raw(statement));
        }
      }
      db.insert(schema.machineState)
        .values({
          id: 1,
          revision: -1,
          stateName: '',
          stateJson: '{}',
          sourceVersion: machine.source.version,
          sourceIndex: 0,
          projectionTables: JSON.stringify(projectionTables(machine)),
          phase: 'bootstrap',
          rebuildDestination: null,
          previousVersion: null,
          wakeAt: null,
        })
        .run();
    }),
  });
  const Base = makeFixedDORepo({ namespaceBinding, fixedDORepoConfig });

  return class MachineRepo extends Base {
    static override readonly fixedDORepoConfig = fixedDORepoConfig;
    readonly #machine = resolveMachine(this.key);
    readonly #selectedConfig = makeMachineSelectedDbConfig(this.#machine);
    readonly #selectedDb = drizzle(this.ctx.storage, {
      relations: this.#selectedConfig.relations,
    });
    readonly #gate = Semaphore.makeUnsafe(1);
    readonly #running = new Map<number, Fiber.Fiber<void, unknown>>();

    constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
      super(ctx, env);
      this.alarmRegistry.register(
        'machine',
        Effect.tryPromise({
          try: () =>
            managedRuntime.runPromise(
              this.#recover().pipe(Effect.provide(AsyncLive)),
            ),
          catch: error =>
            makeZerospinError({
              code: 'machine-recovery-failed',
              cause: String(error),
            }),
        }),
      );
    }

    #state(): IStateRow {
      const row = this.db
        .select()
        .from(this.schema.machineState)
        .where(eq(this.schema.machineState.id, 1))
        .get();
      if (row === undefined) throw new Error('Machine state is missing');
      return row;
    }

    #operation(revision: number): IMachineOperation | undefined {
      return this.db
        .select()
        .from(this.schema.machineOperations)
        .where(eq(this.schema.machineOperations.revision, revision))
        .get();
    }

    frozenCommandMatches(props: {
      revision: number;
      mode: 'push' | 'execute';
      bindingName: string;
      command: unknown;
    }) {
      return managedRuntime.runPromise(
        makeRpcEnvelope(
          Effect.gen({ self: this }, function* () {
            const operation = this.#operation(props.revision);
            if (
              operation?.kind !== 'command' ||
              operation.commandJson === null
            ) {
              return false;
            }
            const frozen = yield* Schema.decodeUnknownEffect(
              FrozenCommandSchema,
            )(JSON.parse(operation.commandJson));
            if (
              frozen.mode !== props.mode ||
              frozen.binding !== props.bindingName
            ) {
              return false;
            }
            if (frozen.targetKind === 'aggregate') {
              const command = yield* Schema.decodeUnknownEffect(
                EncodedAggregateCommandSchema,
              )(props.command);
              const key =
                'aggregateId' in this.key
                  ? Schema.decodeUnknownSync(AggregateKeySchema)(this.key)
                  : Schema.decodeUnknownSync(ServiceKeySchema)(this.key);
              return (
                frozen.aggregateId !== null &&
                command.id === frozen.id &&
                command.aggregateId === frozen.aggregateId &&
                command.aggregateName === frozen.targetName &&
                command.nodeId === null &&
                command.aggregateVersion === frozen.targetVersion &&
                command.commandName === frozen.commandName &&
                command.contractVersion === frozen.contractVersion &&
                command.payload === frozen.payload &&
                command.actorName === '__machine' &&
                command.actorVersion === frozen.targetVersion &&
                command.systemName === config.system.name &&
                command.nodeId === null &&
                command.nodeIndex === null &&
                command.sessionName === null &&
                isEqual(command.claims, {
                  ...frozen.claims,
                  aggregateId: frozen.aggregateId,
                  machineName: key.machineName,
                  bindingName: frozen.binding,
                })
              );
            }
            const command = yield* Schema.decodeUnknownEffect(
              EncodedServiceCommandSchema,
            )(props.command);
            return (
              frozen.aggregateId === null &&
              command.id === frozen.id &&
              command.serviceName === frozen.targetName &&
              command.serviceVersion === frozen.targetVersion &&
              command.commandName === frozen.commandName &&
              command.contractVersion === frozen.contractVersion &&
              command.payload === frozen.payload
            );
          }),
        ),
      );
    }

    #sourceKey(): ISourceKey {
      if (sourceKind === 'aggregate') {
        const key = Schema.decodeUnknownSync(AggregateKeySchema)(this.key);
        if (
          !('services' in this.#machine.source) ||
          this.#machine.source.name !== key.aggregateName
        ) {
          throw new Error(
            'Aggregate machine source does not match its owner key',
          );
        }
        return {
          systemId: key.systemId,
          aggregateName: key.aggregateName,
          aggregateId: key.aggregateId,
          aggregateVersion: this.#machine.source.version,
        };
      }
      const key = Schema.decodeUnknownSync(ServiceKeySchema)(this.key);
      if (
        'services' in this.#machine.source ||
        this.#machine.source.name !== key.serviceName
      ) {
        throw new Error('Service machine source does not match its owner key');
      }
      return {
        systemId: key.systemId,
        serviceName: key.serviceName,
        serviceVersion: this.#machine.source.version,
      };
    }

    #getPage(page: { afterIndex: number; maxIndex?: number }) {
      return Effect.gen({ self: this }, function* () {
        const sourceKey = this.#sourceKey();
        if ('aggregateId' in sourceKey) {
          const repo = yield* AggregateVersionChain.getRepo({ key: sourceKey });
          const queue = yield* makeAsync(() => repo.machineResultsFanout);
          return yield* makeAsync(() => queue.getPage(page)).pipe(
            Effect.flatMap(readRpcEnvelope),
          );
        }
        const repo = yield* ServiceVersionChain.getRepo({ key: sourceKey });
        const queue = yield* makeAsync(() => repo.machineResultsFanout);
        return yield* makeAsync(() => queue.getPage(page)).pipe(
          Effect.flatMap(readRpcEnvelope),
        );
      });
    }

    #subscriber() {
      const sourceKey = this.#sourceKey();
      if ('aggregateId' in sourceKey) {
        const key = Schema.decodeUnknownSync(AggregateKeySchema)(this.key);
        return makeFanoutSubscriber({
          name: 'machineResultsFanout',
          sourceKey,
          key,
          getRepo: AggregateVersionChain.getRepo,
          getCurrentIndex: () => this.#state().sourceIndex,
          receive: delivery =>
            Effect.tryPromise({
              try: () =>
                managedRuntime.runPromise(
                  this.#receive(sourceKey, delivery).pipe(
                    Effect.provide(AsyncLive),
                  ),
                ),
              catch: error =>
                makeZerospinError({
                  code: 'machine-source-receive-failed',
                  message: prettyUnknownFailure(error),
                }),
            }),
        });
      }
      const key = Schema.decodeUnknownSync(ServiceKeySchema)(this.key);
      return makeFanoutSubscriber({
        name: 'machineResultsFanout',
        sourceKey,
        key,
        getRepo: ServiceVersionChain.getRepo,
        getCurrentIndex: () => this.#state().sourceIndex,
        receive: delivery =>
          Effect.tryPromise({
            try: () =>
              managedRuntime.runPromise(
                this.#receive(sourceKey, delivery).pipe(
                  Effect.provide(AsyncLive),
                ),
              ),
            catch: error =>
              makeZerospinError({
                code: 'machine-source-receive-failed',
                message: prettyUnknownFailure(error),
              }),
          }),
      });
    }

    machineResultsFanoutSubscriber(sourceKey: ISourceKey) {
      const expected = this.#sourceKey();
      const matches =
        'aggregateId' in expected
          ? 'aggregateId' in sourceKey &&
            sourceKey.systemId === expected.systemId &&
            sourceKey.aggregateName === expected.aggregateName &&
            sourceKey.aggregateId === expected.aggregateId &&
            sourceKey.aggregateVersion === expected.aggregateVersion
          : !('aggregateId' in sourceKey) &&
            sourceKey.systemId === expected.systemId &&
            sourceKey.serviceName === expected.serviceName &&
            sourceKey.serviceVersion === expected.serviceVersion;
      if (!matches) {
        throw makeZerospinError('machine-source-pin-mismatch');
      }
      return this.#subscriber();
    }

    #receive(sourceKey: ISourceKey, delivery: IPage) {
      return this.#gate.withPermit(
        Effect.gen({ self: this }, function* () {
          const current = this.#state();
          const sourceVersion =
            'aggregateVersion' in sourceKey
              ? sourceKey.aggregateVersion
              : sourceKey.serviceVersion;
          if (
            current.phase !== 'ready' ||
            current.sourceVersion !== sourceVersion
          ) {
            return yield* makeZerospinError('machine-source-pin-mismatch');
          }
          yield* this.alarmRegistry.hold('machine');
          for (const row of delivery.rows) {
            const previousRevision = this.#state().revision;
            yield* applyMachineOccurrenceTx(this.db, {
              schema: this.schema,
              machine: this.#machine,
              repoName: this.name,
              sourceKind,
              selectedSchema: this.#selectedConfig.schema,
              selectedDb: this.#selectedDb,
              row,
              react: true,
            });
            if (this.#state().revision !== previousRevision) {
              if (this.#operation(previousRevision)?.kind === 'activation') {
                this.#running.get(previousRevision)?.interruptUnsafe();
              }
            }
          }
          yield* this.#rearm();
          this.ctx.waitUntil(
            managedRuntime.runPromise(
              this.#recover().pipe(Effect.provide(AsyncLive)),
            ),
          );
        }),
      );
    }

    override onDOActivation() {
      return Effect.gen({ self: this }, function* () {
        yield* this.#prepareSource();
        const subscriber = this.#subscriber();
        yield* makeAsync(() => subscriber.subscribe()).pipe(
          Effect.flatMap(readRpcEnvelope),
        );
        yield* this.#rearm();
        this.ctx.waitUntil(
          managedRuntime.runPromise(
            this.#recover().pipe(Effect.provide(AsyncLive)),
          ),
        );
      }).pipe(
        Effect.mapError(error =>
          makeZerospinError({
            code: 'machine-activation-failed',
            message: prettyUnknownFailure(error),
          }),
        ),
      );
    }

    #prepareSource() {
      return Effect.gen({ self: this }, function* () {
        let state = this.#state();
        if (
          state.phase === 'ready' &&
          state.sourceVersion === this.#machine.source.version
        ) {
          return;
        }
        if (state.phase === 'ready') {
          const page = yield* this.#getPage({ afterIndex: 0, maxIndex: 0 });
          yield* this.alarmRegistry.hold('machine');
          this.db.transaction(tx => {
            tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
            const oldTables = Schema.decodeUnknownSync(
              Schema.Array(Schema.String),
            )(JSON.parse(state.projectionTables));
            for (const name of oldTables) {
              tx.run(
                sql.raw(`DROP TABLE IF EXISTS "${name.replaceAll('"', '""')}"`),
              );
            }
            for (const model of Object.values(this.#machine.source.models)) {
              for (const statement of makeTableProvisioningStatements(
                model.drizzleSchema,
              )) {
                tx.run(sql.raw(statement));
              }
            }
            for (const selectedTable of Object.values(
              this.#selectedConfig.schema,
            )) {
              for (const statement of makeTableProvisioningStatements(
                selectedTable,
                { foreignKeys: false },
              )) {
                tx.run(sql.raw(statement));
              }
            }
            tx.update(this.schema.machineState)
              .set({
                phase: 'rebuilding',
                sourceVersion: this.#machine.source.version,
                sourceIndex: 0,
                projectionTables: JSON.stringify(
                  projectionTables(this.#machine),
                ),
                previousVersion: state.sourceVersion,
                rebuildDestination: page.lastIndex,
              })
              .where(eq(this.schema.machineState.id, 1))
              .run();
          });
          state = this.#state();
        }
        if (state.rebuildDestination === null) {
          const page = yield* this.#getPage({ afterIndex: 0, maxIndex: 0 });
          this.db
            .update(this.schema.machineState)
            .set({ rebuildDestination: page.lastIndex })
            .where(eq(this.schema.machineState.id, 1))
            .run();
          state = this.#state();
        }
        const destination = state.rebuildDestination;
        if (destination === null) {
          throw new Error('Machine rebuild destination missing');
        }
        while (state.sourceIndex < destination) {
          const page = yield* this.#getPage({
            afterIndex: state.sourceIndex,
            maxIndex: destination,
          });
          if (page.rows.length === 0) {
            return yield* makeZerospinError('machine-source-history-missing');
          }
          for (const row of page.rows) {
            yield* applyMachineOccurrenceTx(this.db, {
              schema: this.schema,
              machine: this.#machine,
              repoName: this.name,
              sourceKind,
              selectedSchema: this.#selectedConfig.schema,
              selectedDb: this.#selectedDb,
              row,
              react: false,
            });
          }
          state = this.#state();
        }
        yield* this.alarmRegistry.hold('machine');
        // oxlint-disable-next-line typescript/no-this-alias -- The transaction generator needs the Repo receiver.
        const owner = this;
        const complete = makeTx('MachineRepo.finishSourcePreparation')(
          function* (tx: ITx<IMachineDbConfig>) {
            const current = tx
              .select()
              .from(owner.schema.machineState)
              .where(eq(owner.schema.machineState.id, 1))
              .get();
            if (current === undefined) {
              return yield* makeZerospinError('machine-state-missing');
            }
            if (current.phase === 'bootstrap') {
              const destination = (
                owner.#machine.onBootstrap as (props: {
                  db: unknown;
                }) => unknown
              )({ db: owner.#selectedDb });
              yield* enterMachineStateTx({
                tx,
                schema: owner.schema,
                machine: owner.#machine,
                repoName: owner.name,
                previous: current,
                origin: { stateName: '' },
                destination,
                path: 'onBootstrap',
              });
            } else if (
              current.phase === 'rebuilding' &&
              current.previousVersion !== null
            ) {
              const stateDefinition = owner.#machine.states[current.stateName];
              if (stateDefinition === undefined) {
                return yield* makeZerospinError('machine-state-unavailable');
              }
              const origin = (yield* Schema.decodeUnknownEffect(
                Schema.toCodecJson(stateDefinition.schema),
              )(JSON.parse(current.stateJson)).pipe(
                Effect.scoped,
              )) as IStateValue;
              const callback = owner.#machine.onVersionChange as
                | ((props: {
                    origin: IStateValue;
                    db: unknown;
                    previousVersion: string;
                    version: string;
                  }) => unknown)
                | undefined;
              const next = callback?.({
                origin,
                db: owner.#selectedDb,
                previousVersion: current.previousVersion,
                version: current.sourceVersion,
              });
              if (next !== undefined) {
                yield* enterMachineStateTx({
                  tx,
                  schema: owner.schema,
                  machine: owner.#machine,
                  repoName: owner.name,
                  previous: current,
                  origin,
                  destination: next,
                  path: 'onVersionChange',
                });
              }
            }
            tx.update(owner.schema.machineState)
              .set({
                phase: 'ready',
                previousVersion: null,
                rebuildDestination: null,
              })
              .where(eq(owner.schema.machineState.id, 1))
              .run();
          },
        );
        yield* complete(this.db);
      });
    }

    #rearm() {
      return Effect.gen({ self: this }, function* () {
        const state = this.#state();
        const deadlines: number[] = [];
        if (state.phase === 'ready' && state.wakeAt !== null) {
          deadlines.push(state.wakeAt);
        }
        const operations = this.db
          .select()
          .from(this.schema.machineOperations)
          .where(
            or(
              eq(this.schema.machineOperations.status, 'pending'),
              eq(this.schema.machineOperations.status, 'running'),
            ),
          )
          .all();
        for (const operation of operations) {
          if (
            state.phase !== 'ready' ||
            (operation.kind === 'activation' &&
              operation.revision !== state.revision)
          ) {
            continue;
          }
          deadlines.push(
            operation.retryAt ??
              (operation.status === 'running'
                ? Date.now() + 1_000
                : Date.now()),
          );
        }
        if (deadlines.length === 0) {
          yield* this.alarmRegistry.release('machine');
        } else {
          yield* this.alarmRegistry.hold('machine', Math.min(...deadlines));
        }
      });
    }

    #recover() {
      return this.#gate.withPermit(
        Effect.gen({ self: this }, function* () {
          let state = this.#state();
          if (state.phase !== 'ready') return;
          if (state.wakeAt !== null && state.wakeAt <= Date.now()) {
            const route = this.#machine.routes[state.stateName] as
              | IRuntimeRoute
              | undefined;
            if (route?.onWake === undefined) {
              return yield* makeZerospinError('machine-wake-route-missing');
            }
            yield* this.alarmRegistry.hold('machine');
            // oxlint-disable-next-line typescript/no-this-alias -- The transaction generator needs the Repo receiver.
            const owner = this;
            const wake = makeTx('MachineRepo.wake')(function* (
              tx: ITx<IMachineDbConfig>,
            ) {
              const current = tx
                .select()
                .from(owner.schema.machineState)
                .where(eq(owner.schema.machineState.id, 1))
                .get();
              if (
                current === undefined ||
                current.revision !== state.revision ||
                current.wakeAt === null ||
                current.wakeAt > Date.now()
              ) {
                return;
              }
              const definition = owner.#machine.states[current.stateName];
              if (definition === undefined) {
                return yield* makeZerospinError('machine-state-unavailable');
              }
              const origin = (yield* Schema.decodeUnknownEffect(
                Schema.toCodecJson(definition.schema),
              )(JSON.parse(current.stateJson)).pipe(
                Effect.scoped,
              )) as IStateValue;
              const destination = route.onWake!({
                origin,
                db: owner.#selectedDb,
              });
              yield* enterMachineStateTx({
                tx,
                schema: owner.schema,
                machine: owner.#machine,
                repoName: owner.name,
                previous: current,
                origin,
                destination,
                path: `${current.stateName}.onWake`,
              });
            });
            yield* wake(this.db);
            this.#running.get(state.revision)?.interruptUnsafe();
            state = this.#state();
          }
          const operations = this.db
            .select()
            .from(this.schema.machineOperations)
            .where(
              or(
                eq(this.schema.machineOperations.status, 'pending'),
                eq(this.schema.machineOperations.status, 'running'),
              ),
            )
            .all();
          for (const operation of operations) {
            if (
              operation.kind === 'activation' &&
              operation.revision !== state.revision
            ) {
              continue;
            }
            if (
              this.#running.has(operation.revision) ||
              (operation.retryAt !== null && operation.retryAt > Date.now())
            ) {
              continue;
            }
            this.db
              .update(this.schema.machineOperations)
              .set({ status: 'running', retryAt: null })
              .where(eq(this.schema.machineOperations.id, operation.id))
              .run();
            const fiber = managedRuntime.runFork(
              this.#execute(operation).pipe(Effect.provide(AsyncLive)),
            );
            this.#running.set(operation.revision, fiber);
            fiber.addObserver(() => this.#running.delete(operation.revision));
          }
          yield* this.#rearm();
        }),
      );
    }

    #execute(operation: IMachineOperation) {
      return Effect.gen({ self: this }, function* () {
        const state = this.#state();
        if (
          operation.kind === 'activation' &&
          state.revision !== operation.revision
        ) {
          return;
        }
        const definition = this.#machine.states[state.stateName];
        const route = this.#machine.routes[state.stateName] as
          | IRuntimeRoute
          | undefined;
        if (
          operation.kind === 'activation' &&
          (definition === undefined || route === undefined)
        ) {
          return yield* makeZerospinError('machine-state-unavailable');
        }
        const origin =
          definition === undefined
            ? null
            : ((yield* Schema.decodeUnknownEffect(
                Schema.toCodecJson(definition.schema),
              )(JSON.parse(state.stateJson)).pipe(
                Effect.scoped,
              )) as IStateValue);
        const result =
          operation.kind === 'activation'
            ? yield* Effect.exit(
                Effect.suspend(() => {
                  if (route?.onActivation === undefined) {
                    throw new Error('Machine activation route missing');
                  }
                  return route.onActivation({ origin: origin! });
                }).pipe(Effect.scoped),
              )
            : operation.resultJson === null
              ? yield* Effect.exit(this.#dispatchCommand(operation))
              : Exit.succeed(JSON.parse(operation.resultJson));
        yield* this.#gate.withPermit(
          Effect.gen({ self: this }, function* () {
            const current = this.#state();
            const saved = this.#operation(operation.revision);
            if (saved?.status !== 'running') return;
            if (Exit.isFailure(result)) {
              this.db
                .update(this.schema.machineOperations)
                .set(
                  operation.kind === 'activation'
                    ? { status: 'failed', failure: Cause.pretty(result.cause) }
                    : {
                        status: 'pending',
                        failure: Cause.pretty(result.cause),
                        retryAt: Date.now() + 1_000,
                      },
                )
                .where(eq(this.schema.machineOperations.id, operation.id))
                .run();
            } else {
              if (operation.kind === 'command' && saved.resultJson === null) {
                this.db
                  .update(this.schema.machineOperations)
                  .set({ resultJson: JSON.stringify(result.value) })
                  .where(eq(this.schema.machineOperations.id, operation.id))
                  .run();
              }
              if (current.revision !== operation.revision) {
                this.db
                  .update(this.schema.machineOperations)
                  .set({ status: 'succeeded', failure: null })
                  .where(eq(this.schema.machineOperations.id, operation.id))
                  .run();
                yield* this.#rearm();
                return;
              }
              yield* this.alarmRegistry.hold('machine');
              // oxlint-disable-next-line typescript/no-this-alias -- The transaction generator needs the Repo receiver.
              const owner = this;
              const transition = makeTx('MachineRepo.commitResult')(function* (
                tx: ITx<IMachineDbConfig>,
              ) {
                const again = tx
                  .select()
                  .from(owner.schema.machineState)
                  .where(eq(owner.schema.machineState.id, 1))
                  .get();
                if (
                  again === undefined ||
                  again.revision !== operation.revision
                ) {
                  return;
                }
                const currentDefinition =
                  owner.#machine.states[again.stateName];
                const currentRoute = owner.#machine.routes[again.stateName] as
                  | IRuntimeRoute
                  | undefined;
                if (
                  currentDefinition === undefined ||
                  currentRoute === undefined
                ) {
                  return yield* makeZerospinError('machine-state-unavailable');
                }
                const currentOrigin = (yield* Schema.decodeUnknownEffect(
                  Schema.toCodecJson(currentDefinition.schema),
                )(JSON.parse(again.stateJson)).pipe(
                  Effect.scoped,
                )) as IStateValue;
                const destination =
                  operation.kind === 'activation'
                    ? result.value
                    : currentRoute.onResult?.({
                        origin: currentOrigin,
                        db: owner.#selectedDb,
                        result: result.value,
                      });
                if (destination === undefined) {
                  return yield* makeZerospinError(
                    'machine-result-route-missing',
                  );
                }
                yield* enterMachineStateTx({
                  tx,
                  schema: owner.schema,
                  machine: owner.#machine,
                  repoName: owner.name,
                  previous: again,
                  origin: currentOrigin,
                  destination,
                  path: `${again.stateName}.${operation.kind}`,
                });
                tx.update(owner.schema.machineOperations)
                  .set({
                    status: 'succeeded',
                    resultJson: JSON.stringify(result.value),
                    failure: null,
                  })
                  .where(eq(owner.schema.machineOperations.id, operation.id))
                  .run();
              });
              const committed = yield* Effect.exit(transition(this.db));
              if (Exit.isFailure(committed)) {
                this.db
                  .update(this.schema.machineOperations)
                  .set({
                    status: 'failed',
                    failure: Cause.pretty(committed.cause),
                  })
                  .where(eq(this.schema.machineOperations.id, operation.id))
                  .run();
              }
            }
            yield* this.#rearm();
            if (this.#state().revision !== operation.revision) {
              this.ctx.waitUntil(
                managedRuntime.runPromise(
                  this.#recover().pipe(Effect.provide(AsyncLive)),
                ),
              );
            }
          }),
        );
      });
    }

    #dispatchCommand(operation: IMachineOperation) {
      return Effect.gen({ self: this }, function* () {
        if (operation.commandJson === null) {
          return yield* makeZerospinError('machine-command-missing');
        }
        const command = yield* Schema.decodeUnknownEffect(FrozenCommandSchema)(
          JSON.parse(operation.commandJson),
        );
        const key =
          'aggregateId' in this.key
            ? Schema.decodeUnknownSync(AggregateKeySchema)(this.key)
            : Schema.decodeUnknownSync(ServiceKeySchema)(this.key);
        if (command.targetKind === 'aggregate') {
          if (command.aggregateId === null) {
            return yield* makeZerospinError('machine-command-target-invalid');
          }
          const aggregateCommand = yield* Schema.decodeUnknownEffect(
            EncodedAggregateCommandSchema,
          )({
            id: command.id,
            commandName: command.commandName,
            contractVersion: command.contractVersion,
            payload: command.payload,
            aggregateId: command.aggregateId,
            aggregateName: command.targetName,
            aggregateVersion: command.targetVersion,
            systemName: config.system.name,
            actorName: '__machine',
            actorVersion: command.targetVersion,
            claims: {
              ...command.claims,
              aggregateId: command.aggregateId,
              machineName: key.machineName,
              bindingName: command.binding,
            },
            nodeId: null,
            nodeIndex: null,
            sessionName: null,
          });
          const chain = yield* AggregateChain.getRepo({
            key: {
              systemId: key.systemId,
              aggregateName: command.targetName,
              aggregateId: command.aggregateId,
            },
          });
          const result = yield* makeAsync<
            Awaited<ReturnType<AggregateChain['submitMachineCommand']>>
          >(() =>
            chain.submitMachineCommand({
              aggregateVersion: command.targetVersion,
              mode: command.mode,
              command: aggregateCommand,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          return 'accepted' in result
            ? result
            : {
                commandId: command.id,
                admission: result.admission,
                execution: result.execution,
              };
        }
        if (command.aggregateId !== null) {
          return yield* makeZerospinError('machine-command-target-invalid');
        }
        const serviceCommand = yield* Schema.decodeUnknownEffect(
          EncodedServiceCommandSchema,
        )({
          id: command.id,
          commandName: command.commandName,
          contractVersion: command.contractVersion,
          payload: command.payload,
          serviceName: command.targetName,
          serviceVersion: command.targetVersion,
        });
        const chain = yield* ServiceChain.getRepo({
          key: { systemId: key.systemId, serviceName: command.targetName },
        });
        const result = yield* makeAsync<
          Awaited<ReturnType<ServiceChain['submitMachineCommand']>>
        >(() =>
          chain.submitMachineCommand({
            machineName: key.machineName,
            bindingName: command.binding,
            mode: command.mode,
            command: serviceCommand,
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        return 'accepted' in result
          ? result
          : {
              commandId: command.id,
              admission: result.admission,
              execution: result.execution,
            };
      });
    }

    getState() {
      return managedRuntime.runPromise(
        makeRpcEnvelope(
          Effect.gen({ self: this }, function* () {
            const row = this.#state();
            if (row.revision < 0) {
              return {
                revision: row.revision,
                state: null,
                sourceIndex: row.sourceIndex,
              };
            }
            const definition = this.#machine.states[row.stateName];
            if (definition === undefined) {
              return yield* makeZerospinError('machine-state-unavailable');
            }
            const state = yield* Schema.decodeUnknownEffect(
              Schema.toCodecJson(definition.schema),
            )(JSON.parse(row.stateJson)).pipe(Effect.scoped);
            return {
              revision: row.revision,
              state,
              sourceIndex: row.sourceIndex,
            };
          }),
        ),
      );
    }

    getOperation(props: { revision: number }) {
      return managedRuntime.runPromise(
        makeRpcEnvelope(
          Effect.sync(() => this.#operation(props.revision) ?? null),
        ),
      );
    }
  };
}
