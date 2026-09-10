import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  AggregateExecutionEntrySchema,
  ServiceExecutionEntrySchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Schema, Semaphore } from 'effect';
import { system } from 'system';
import { beforeEach, expect, it, vi } from 'vitest';

import { genesisDispositionHash } from './aggregateDispositionHash/aggregateDispositionHash.js';
import { executeCommands as executeAggregate } from './VersionedAggregateRepo/executeCommands/executeCommands.js';
import {
  versionedAggregateRepoDbConfig,
  versionedAggregateRepoTables,
} from './VersionedAggregateRepo/versionedAggregateRepoDbConfig.js';
import { executeCommands as executeService } from './VersionedServiceRepo/executeCommands/executeCommands.js';
import {
  versionedServiceRepoDbConfig,
  versionedServiceRepoTables,
} from './VersionedServiceRepo/versionedServiceRepoDbConfig.js';

const observations = vi.hoisted(
  (): {
    guardServices: string[];
    appAcquisitions: number;
    localInputs: string[];
    appGuardServices: string[];
    failAcquisition: boolean;
    interruptAcquisition: boolean;
    failApplication: boolean;
    releasedLayers: string[];
    adapters: string[];
    programs: unknown[];
    guards: unknown[];
    reject: boolean;
    suspend: boolean;
  } => ({
    guardServices: [],
    appAcquisitions: 0,
    localInputs: [],
    appGuardServices: [],
    failAcquisition: false,
    interruptAcquisition: false,
    failApplication: false,
    releasedLayers: [],
    adapters: [],
    programs: [],
    guards: [],
    reject: false,
    suspend: false,
  }),
);

vi.mock('system', async () => {
  const { initializeGuards } =
    await import('@zerospin/core/guards/initializeGuards');
  const { MonotonicFactory } =
    await import('@zerospin/core/services/MonotonicFactory');
  const { contracts } = await import('@zerospin/core/contracts/index');
  const { models } = await import('@zerospin/core/models/index');
  const { primitives, CuidFactory } = await import('@zerospin/schema');
  const { ZerospinError } = await import('@zerospin/error');
  const { Effect, Layer } = await import('effect');
  const product = models.makeVersion(
    models.makeModel({ name: 'product', abbreviation: 'prd' }),
    {
      version: '1.0.0',
      attributes: { name: primitives.text() },
      indexes: [],
    },
  );
  const first = contracts.makeVersion(contracts.makeCommand('rename'), {
    version: '1.0.0',
    payload: { name: primitives.text() },
    models: { product },
    program: ({ payload, models }) => {
      observations.programs.push(payload);
      return models.product.create({
        resourceId: product.prefixId('prepared'),
        attributes: { name: payload.name },
      });
    },
    guard: ({ payload }) =>
      Effect.gen(function* () {
        const makeId = yield* CuidFactory;
        observations.guardServices.push(yield* makeId());
        const clock = yield* MonotonicFactory;
        observations.appGuardServices.push(yield* clock());
        observations.guards.push(payload);
        if (observations.suspend) return yield* Effect.sleep('1 millis');
        return yield* observations.reject
          ? Effect.fail(
              new ZerospinError({
                code: 'guard-rejected',
                message: 'rejected',
              }),
            )
          : Effect.void;
      }),
  });
  const next = contracts.upgradeVersion(first, {
    version: '2.0.0',
    payload: { name: null, title: primitives.text() },
    up: ({ payload }) => {
      observations.adapters.push('up');
      return Effect.succeed({ title: payload.name });
    },
    down: ({ payload }) => {
      observations.adapters.push('down');
      return Effect.succeed({ name: payload.title });
    },
    models: { product },
    program: ({ payload, models }) => {
      observations.programs.push(payload);
      return models.product.create({
        resourceId: product.prefixId('prepared'),
        attributes: { name: payload.title },
      });
    },
    guard: ({ payload }) =>
      Effect.gen(function* () {
        const makeId = yield* CuidFactory;
        observations.guardServices.push(yield* makeId());
        const clock = yield* MonotonicFactory;
        observations.appGuardServices.push(yield* clock());
        observations.guards.push(payload);
        if (observations.suspend) return yield* Effect.sleep('1 millis');
        return yield* observations.reject
          ? Effect.fail(
              new ZerospinError({
                code: 'guard-rejected',
                message: 'rejected',
              }),
            )
          : Effect.void;
      }),
  });
  return {
    system: {
      name: 'prepared',
      layer: Layer.mergeAll(
        Layer.effect(
          CuidFactory,
          Effect.acquireRelease(
            Effect.sync(() => {
              observations.appAcquisitions++;
              return () => Effect.succeed('application');
            }),
            () =>
              Effect.sync(() => {
                observations.releasedLayers.push('application');
              }),
          ).pipe(
            Effect.flatMap(service =>
              observations.failApplication
                ? Effect.fail(
                    new ZerospinError({
                      code: 'layer-failed',
                      message: 'Application failed',
                    }),
                  )
                : Effect.succeed(service),
            ),
          ),
        ),
        Layer.succeed(MonotonicFactory, () => Effect.succeed('app-clock')),
      ),
      aggregates: {
        user: Object.fromEntries(
          [first, next].map(contract => [
            contract.version,
            {
              initializeGuards: initializeGuards({
                layer: Layer.effect(
                  CuidFactory,
                  Effect.acquireRelease(
                    Effect.gen(function* () {
                      const applicationId = yield* CuidFactory;
                      observations.localInputs.push(yield* applicationId());
                      yield* Effect.promise(async () => undefined);
                      return () =>
                        Effect.succeed(`aggregate-${contract.version}`);
                    }),
                    () =>
                      Effect.sync(() => {
                        observations.releasedLayers.push(
                          `aggregate-${contract.version}`,
                        );
                      }),
                  ).pipe(
                    Effect.flatMap(service =>
                      observations.interruptAcquisition
                        ? Effect.never
                        : observations.failAcquisition
                          ? Effect.fail(
                              new ZerospinError({
                                code: 'layer-failed',
                                message: 'Layer failed',
                              }),
                            )
                          : Effect.succeed(service),
                    ),
                  ),
                ),
                guards: {
                  rename: contract.guard === undefined ? [] : [contract.guard],
                },
              }),
              name: 'user',
              version: contract.version,
              models: { product },
              services: {},
              contracts: { rename: { contract } },
              selections: {},
            },
          ]),
        ),
      },
      services: {
        app: Object.fromEntries(
          [first, next].map(contract => [
            contract.version,
            {
              initializeGuards: initializeGuards({
                layer: Layer.effect(
                  CuidFactory,
                  Effect.acquireRelease(
                    Effect.gen(function* () {
                      const applicationId = yield* CuidFactory;
                      observations.localInputs.push(yield* applicationId());
                      yield* Effect.promise(async () => undefined);
                      return () =>
                        Effect.succeed(`service-${contract.version}`);
                    }),
                    () =>
                      Effect.sync(() => {
                        observations.releasedLayers.push(
                          `service-${contract.version}`,
                        );
                      }),
                  ).pipe(
                    Effect.flatMap(service =>
                      observations.interruptAcquisition
                        ? Effect.never
                        : observations.failAcquisition
                          ? Effect.fail(
                              new ZerospinError({
                                code: 'layer-failed',
                                message: 'Layer failed',
                              }),
                            )
                          : Effect.succeed(service),
                    ),
                  ),
                ),
                guards: {
                  rename: contract.guard === undefined ? [] : [contract.guard],
                },
              }),
              name: 'app',
              version: contract.version,
              models: { product },
              contracts: { rename: contract },
            },
          ]),
        ),
      },
    },
  };
});

beforeEach(() => {
  observations.guardServices.length = 0;
  observations.appAcquisitions = 0;
  observations.localInputs.length = 0;
  observations.appGuardServices.length = 0;
  observations.failAcquisition = false;
  observations.interruptAcquisition = false;
  observations.failApplication = false;
  observations.releasedLayers.length = 0;
  observations.adapters.length = 0;
  observations.programs.length = 0;
  observations.guards.length = 0;
  observations.reject = false;
  observations.suspend = false;
});

it.each([
  {
    kind: 'aggregate',
    version: '1.0.0',
    sourceVersion: '2.0.0',
    payload: { title: 'Prepared' },
    adapter: 'down',
  },
  {
    kind: 'aggregate',
    version: '2.0.0',
    sourceVersion: '1.0.0',
    payload: { name: 'Prepared' },
    adapter: 'up',
  },
  {
    kind: 'service',
    version: '1.0.0',
    sourceVersion: '2.0.0',
    payload: { title: 'Prepared' },
    adapter: 'down',
  },
  {
    kind: 'service',
    version: '2.0.0',
    sourceVersion: '1.0.0',
    payload: { name: 'Prepared' },
    adapter: 'up',
  },
])(
  'reuses the $adapter payload in $kind programs and guards, including retries',
  async scenario => {
    const models = system.aggregates.user[scenario.version]!.models;
    for (const outcome of [
      'success',
      'rejected',
      'rollback',
      'acquisition-failed',
      'application-failed',
      'interrupted',
    ]) {
      observations.guardServices.length = 0;
      observations.releasedLayers.length = 0;
      observations.adapters.length = 0;
      observations.programs.length = 0;
      observations.guards.length = 0;
      observations.reject = outcome === 'rejected';
      observations.suspend = outcome === 'rollback';
      observations.failAcquisition = outcome === 'acquisition-failed';
      observations.failApplication = outcome === 'application-failed';
      observations.interruptAcquisition = outcome === 'interrupted';
      observations.localInputs.length = 0;
      observations.appGuardServices.length = 0;
      observations.appAcquisitions = 0;
      const db = await Effect.runPromise(
        makeProvisionedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({
            models,
            otherTables:
              scenario.kind === 'aggregate'
                ? versionedAggregateRepoTables
                : versionedServiceRepoTables,
          }),
        }).pipe(Effect.provide(AsyncLive)),
      );
      if (scenario.kind === 'aggregate') {
        db.insert(versionedAggregateRepoDbConfig.schema.head)
          .values({
            singletonId: 1,
            aggregateIndex: 0,
            dispositionHash: genesisDispositionHash(),
          })
          .run();
      }
      const command = JSON.stringify({
        id: 'cmd_prepared',
        commandName: 'rename',
        contractVersion: scenario.sourceVersion,
        payload: JSON.stringify(scenario.payload),
        ...(scenario.kind === 'aggregate'
          ? {
              systemName: 'prepared',
              aggregateName: 'user',
              aggregateVersion: scenario.version,
              aggregateId: 'acct_prepared',
              userId: null,
              sessionId: null,
              frontendName: null,
              pushIndex: null,
            }
          : { serviceName: 'app', serviceVersion: scenario.version }),
      });
      const execution =
        scenario.kind === 'aggregate'
          ? executeAggregate({
              db,
              execution: Semaphore.makeUnsafe(1),
              key: {
                systemId: 'sys_prepared',
                aggregateName: 'user',
                aggregateId: 'acct_prepared',
                aggregateVersion: scenario.version,
              },
              commands: [
                { aggregateIndex: 1, command, chainedAt: new Date(1) },
              ],
            })
          : executeService({
              db,
              key: {
                systemId: 'sys_prepared',
                serviceName: 'app',
                serviceVersion: scenario.version,
              },
              rows: [
                {
                  fanoutIndex: 1,
                  command,
                  canonicalBytes: command,
                  commandId: 'cmd_prepared',
                  chainedAt: new Date(1),
                },
              ],
            });
      const first = await Effect.runPromise(
        execution.pipe(
          Effect.provide(AsyncLive),
          Effect.timeout('100 millis'),
          Effect.result,
        ),
      );
      if (
        ['acquisition-failed', 'application-failed', 'interrupted'].includes(
          outcome,
        )
      ) {
        expect(first).toMatchObject({ _tag: 'Failure' });
        const released =
          outcome === 'application-failed'
            ? ['application']
            : [`${scenario.kind}-${scenario.version}`, 'application'];
        expect(observations.guards).toEqual([]);
        expect(db.select().from(models.product!.drizzleSchema).all()).toEqual(
          [],
        );
        expect(observations.releasedLayers).toEqual(released);
        observations.failAcquisition = false;
        observations.failApplication = false;
        observations.interruptAcquisition = false;
        await Effect.runPromise(execution.pipe(Effect.provide(AsyncLive)));
        expect(observations.appAcquisitions).toBe(2);
        expect(observations.guards).toHaveLength(1);
        expect(observations.releasedLayers).toEqual([
          ...released,
          `${scenario.kind}-${scenario.version}`,
          'application',
        ]);
        continue;
      }
      expect(observations.guardServices).toEqual([
        `${scenario.kind}-${scenario.version}`,
      ]);
      expect(observations.localInputs).toEqual(['application']);
      expect(observations.appGuardServices).toEqual(['app-clock']);
      expect(observations.releasedLayers).toEqual([
        `${scenario.kind}-${scenario.version}`,
        'application',
      ]);
      expect(observations.adapters).toEqual([scenario.adapter]);
      expect(observations.guards).toHaveLength(1);
      expect(observations.guards[0]).toBe(observations.programs[0]);
      expect(observations.guards[0]).toEqual(
        scenario.version === '1.0.0'
          ? { name: 'Prepared' }
          : { title: 'Prepared' },
      );
      expect(
        db.select().from(models.product!.drizzleSchema).all(),
      ).toHaveLength(outcome === 'success' ? 1 : 0);
      if (outcome === 'rollback') {
        expect(first).toMatchObject({ _tag: 'Failure' });
        observations.suspend = false;
      } else {
        expect(first).toMatchObject({ _tag: 'Success' });
      }
      await Effect.runPromise(execution.pipe(Effect.provide(AsyncLive)));
      expect(observations.adapters).toHaveLength(
        outcome === 'rollback' ? 2 : 1,
      );
      expect(observations.appAcquisitions).toBe(outcome === 'rollback' ? 2 : 1);
      expect(observations.guards).toHaveLength(outcome === 'rollback' ? 2 : 1);
      if (outcome === 'rollback') {
        expect(observations.guards[1]).toBe(observations.programs[1]);
      }
      const retained =
        scenario.kind === 'aggregate'
          ? db
              .select()
              .from(versionedAggregateRepoDbConfig.schema.executedCommands)
              .get()
          : db.select().from(versionedServiceRepoDbConfig.schema.results).get();
      expect(retained).toBeDefined();
      if (!retained) throw new Error('Expected retained result');
      const entry =
        scenario.kind === 'aggregate'
          ? Schema.decodeUnknownSync(
              Schema.fromJsonString(AggregateExecutionEntrySchema),
            )(retained.entry)
          : Schema.decodeUnknownSync(
              Schema.fromJsonString(ServiceExecutionEntrySchema),
            )(retained.entry);
      expect(entry.sourceCommand).toBe(command);
      expect(entry.command.payload).toBe(JSON.stringify(scenario.payload));
      expect(entry.command.contractVersion).toBe(scenario.sourceVersion);
      expect(entry.command.failure?.code ?? null).toBe(
        outcome === 'rejected' ? 'guard-rejected' : null,
      );
      expect(entry).not.toHaveProperty('guardInputs');
      expect(entry).not.toHaveProperty('executionInput');
    }
  },
);

it.each([false, true])(
  'executes frontend input with authoritative guards when rejection is %s',
  async reject => {
    observations.reject = reject;
    const models = system.aggregates.user['1.0.0'].models;
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          models,
          otherTables: versionedAggregateRepoTables,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    db.insert(versionedAggregateRepoDbConfig.schema.head)
      .values({
        singletonId: 1,
        aggregateIndex: 0,
        dispositionHash: genesisDispositionHash(),
      })
      .run();

    const command = JSON.stringify({
      id: 'cmd_frontend',
      commandName: 'rename',
      contractVersion: '1.0.0',
      payload: '{"name":"Frontend"}',
      systemName: 'prepared',
      aggregateName: 'user',
      aggregateId: 'acct_prepared',
      userId: 'user_test',
      sessionId: 'sesn_test',
      frontendName: 'web',
      pushIndex: 1,
    });
    await Effect.runPromise(
      executeAggregate({
        db,
        execution: Semaphore.makeUnsafe(1),
        key: {
          systemId: 'sys_prepared',
          aggregateName: 'user',
          aggregateId: 'acct_prepared',
          aggregateVersion: '1.0.0',
        },
        commands: [{ aggregateIndex: 1, command, chainedAt: new Date(1) }],
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(observations.guardServices).toEqual(['aggregate-1.0.0']);
    expect(observations.releasedLayers).toEqual([
      'aggregate-1.0.0',
      'application',
    ]);
    expect(observations.localInputs).toEqual(['application']);
    expect(observations.appGuardServices).toEqual(['app-clock']);
    expect(observations.adapters).toEqual([]);
    expect(observations.guards[0]).toBe(observations.programs[0]);
    expect(observations.guards[0]).toEqual({ name: 'Frontend' });
    expect(db.select().from(models.product.drizzleSchema).all()).toHaveLength(
      reject ? 0 : 1,
    );
    const retained = db
      .select()
      .from(versionedAggregateRepoDbConfig.schema.executedCommands)
      .get();
    if (!retained) throw new Error('Expected terminal result');
    const entry = Schema.decodeUnknownSync(
      Schema.fromJsonString(AggregateExecutionEntrySchema),
    )(retained.entry);
    expect(entry.command.failure?.code ?? null).toBe(
      reject ? 'guard-rejected' : null,
    );
    expect(entry.sourceCommand).toBe(command);
  },
);
