import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { AggregateExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { makeModelMutations } from '@zerospin/core/contracts/makeModelMutations';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { Effect, Schema, Semaphore } from 'effect';
import initSqlJs from 'sql.js';
import { system } from 'system';
import { expect, it, vi } from 'vitest';

import { genesisDispositionHash } from './aggregateDispositionHash/aggregateDispositionHash.js';
import { executeCommands } from './VersionedAggregateRepo/executeCommands/executeCommands.js';
import { getReplicatedResources } from './VersionedAggregateRepo/getReplicatedResources/getReplicatedResources.js';
import {
  versionedAggregateRepoDbConfig,
  versionedAggregateRepoTables,
} from './VersionedAggregateRepo/versionedAggregateRepoDbConfig.js';

const inputs = vi.hoisted(
  (): {
    requests: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
    }[];
    missing: boolean;
    deletedAt: Date | null;
    sourceName: string;
    history: { outboxIndex: number; executionVersion: string; entry: string }[];
    historyRequests: {
      afterIndex: number;
      maxIndex: number;
    }[];
  } => ({
    requests: [],
    missing: false,
    deletedAt: null,
    sourceName: 'Authoritative product',
    history: [],
    historyRequests: [],
  }),
);

vi.mock('system', async importOriginal => {
  const original =
    await importOriginal<typeof import('./fixtures/system.js')>();
  return {
    ...original,
    system: {
      ...original.system,
      aggregates: {
        ...original.system.aggregates,
        user: Object.fromEntries(
          ['1.0.0', '2.0.0'].map(version => [
            version,
            {
              ...original.system.aggregates.user['1.0.0'],
              version,
              getVersion: () =>
                Effect.succeed({
                  ...original.system.aggregates.user['1.0.0'],
                  version,
                }),
            },
          ]),
        ),
      },
    },
  };
});

vi.mock(
  './ServiceAdmittedChain/ServiceAdmittedChain.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('./ServiceAdmittedChain/ServiceAdmittedChain.js')
      >();
    Object.assign(actual.ServiceAdmittedChain, {
      getRepo: () => {
        throw new Error('Replica reads must not select the service base');
      },
    });
    return actual;
  },
);
vi.mock(
  './VersionedServiceChain/VersionedServiceChain.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('./VersionedServiceChain/VersionedServiceChain.js')
      >();
    Object.assign(actual.VersionedServiceChain, {
      getRepo: () =>
        Effect.succeed({
          replicaFanoutQueue: Promise.resolve({
            getPage: async (request: {
              afterIndex: number;
              maxIndex: number;
            }) => {
              inputs.historyRequests.push(request);
              return {
                _tag: 'Success',
                success: {
                  lastIndex: inputs.history.at(-1)?.outboxIndex ?? 0,
                  rows: inputs.history.filter(
                    row =>
                      row.outboxIndex > request.afterIndex &&
                      row.outboxIndex <= request.maxIndex,
                  ),
                },
              };
            },
          }),
        }),
    });
    return actual;
  },
);
vi.mock(
  './VersionedServiceRepo/VersionedServiceRepo.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('./VersionedServiceRepo/VersionedServiceRepo.js')
      >();
    Object.assign(actual.VersionedServiceRepo, {
      getRepo: ({
        key,
      }: {
        key: { systemId: string; serviceName: string; serviceVersion: string };
      }) => {
        inputs.requests.push(key);
        return Effect.succeed({
          getReplicatedResources: async ({
            resources,
          }: {
            resources: readonly { modelName: string; resourceId: string }[];
          }) => ({
            _tag: 'Success',
            success: {
              serviceIndex: 42,
              resources: resources.map(ref =>
                inputs.missing
                  ? { ...ref, status: 'missing' }
                  : {
                      ...ref,
                      status: 'found',
                      resource: {
                        id: ref.resourceId,
                        modelName: ref.modelName,
                        version: '1.0.0',
                        name: inputs.sourceName,
                        createdAt: new Date(1),
                        updatedAt: new Date(2),
                        ...(inputs.deletedAt === null
                          ? {}
                          : { deletedAt: inputs.deletedAt }),
                      },
                    },
              ),
            },
          }),
        });
      },
    });
    return actual;
  },
);

it.each([false, true])(
  'captures the aggregate pin and source position with tombstone=%s',
  async tombstone => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          otherTables: versionedAggregateRepoTables,
          models: system.aggregates.user['1.0.0'].models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    inputs.requests = [];
    inputs.sourceName = 'Authoritative product';
    inputs.missing = false;
    inputs.deletedAt = tombstone ? new Date(3) : null;
    const mutation = await Effect.runPromise(
      makeModelMutations(
        system.aggregates.user['1.0.0'].models.product,
      ).replicate({
        id: 'prd_pinned_capture',
        modelName: 'product',
        version: '1.0.0',
        name: 'Caller placeholder',
        createdAt: new Date(1),
        updatedAt: new Date(1),
      }),
    );
    const captured = await Effect.runPromise(
      getReplicatedResources({
        db,
        systemId: 'sys_pinned_capture',
        services: { app: '4.0.0' },
        mutations: [mutation, mutation],
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(inputs.requests).toEqual([
      {
        systemId: 'sys_pinned_capture',
        serviceName: 'app',
        serviceVersion: '4.0.0',
      },
    ]);
    expect(captured).toHaveLength(2);
    expect(captured[0]).toMatchObject({
      modelName: 'product',
      modelVersion: '1.0.0',
      resourceId: 'prd_pinned_capture',
      operationName: 'replicate',
      operation: {
        serviceName: 'app',
        serviceVersion: '4.0.0',
        serviceIndex: 42,
        resource: {
          name: 'Authoritative product',
          deletedAt: inputs.deletedAt,
        },
      },
    });
    expect(captured[1]).toEqual(captured[0]);
  },
);

it('rejects missing source resources and missing pins without manufacturing a copy', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: versionedAggregateRepoTables,
        models: system.aggregates.user['1.0.0'].models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  inputs.requests = [];
  inputs.missing = true;
  const mutation = await Effect.runPromise(
    makeModelMutations(
      system.aggregates.user['1.0.0'].models.product,
    ).replicate({
      id: 'prd_missing_capture',
      modelName: 'product',
      version: '1.0.0',
      name: 'Caller placeholder',
      createdAt: new Date(1),
      updatedAt: new Date(1),
    }),
  );
  const missing = await Effect.runPromise(
    getReplicatedResources({
      db,
      systemId: 'sys_pinned_capture',
      services: { app: '1.0.0' },
      mutations: [mutation],
    }).pipe(Effect.result, Effect.provide(AsyncLive)),
  );
  expect(missing).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-replicated-resource-missing' },
  });
  inputs.requests = [];
  const unpinned = await Effect.runPromise(
    getReplicatedResources({
      db,
      systemId: 'sys_pinned_capture',
      services: {},
      mutations: [mutation],
    }).pipe(Effect.result, Effect.provide(AsyncLive)),
  );
  expect(unpinned).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'replica-service-pin-missing' },
  });
  expect(inputs.requests).toEqual([]);
});

it.each([false, true])(
  'prepares a late enrollment through committed source progress with tombstone=%s',
  async tombstone => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          otherTables: versionedAggregateRepoTables,
          models: system.aggregates.user['1.0.0'].models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const tables = versionedAggregateRepoDbConfig.schema;
    db.insert(tables.services)
      .values({
        serviceName: 'app',
        lastIndex: 45,
      })
      .run();
    inputs.requests = [];
    inputs.historyRequests = [];
    inputs.missing = false;
    inputs.deletedAt = null;
    inputs.sourceName = 'Authoritative product';
    inputs.history = [43, 44, 45].map(serviceIndex => {
      const resource = {
        id: serviceIndex === 44 ? 'prd_unrelated' : 'prd_late',
        modelName: 'product',
        version: '1.0.0',
        name: 'Updated after snapshot',
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(serviceIndex).toISOString(),
        deletedAt:
          tombstone && serviceIndex === 45
            ? new Date(serviceIndex).toISOString()
            : null,
      };
      const sourceCommand = {
        id: `cmd_suffix${serviceIndex}`,
        serviceVersion: '1.0.0',
        serviceName: 'app',
        commandName: 'updateProduct',
        contractVersion: '1.1.0',
        payload: JSON.stringify({ id: resource.id, name: resource.name }),
      };
      return {
        outboxIndex: serviceIndex,
        executionVersion: '1.0.0',
        entry: JSON.stringify({
          sourceCommand: JSON.stringify(sourceCommand),
          command: {
            ...sourceCommand,
            serviceIndex,
            dispositionHash: '0'.repeat(64),
            chainedAt: new Date(serviceIndex).toISOString(),
            delta: {
              inserted: [],
              updated:
                serviceIndex !== 43 && !(tombstone && serviceIndex === 45)
                  ? [resource]
                  : [],
              deleted: tombstone && serviceIndex === 45 ? [resource] : [],
              mutations: [],
            },
            failedAt:
              serviceIndex === 43 ? new Date(serviceIndex).toISOString() : null,
            failure:
              serviceIndex === 43
                ? {
                    code: 'source-rejected',
                    message: 'Rejected',
                    cause: null,
                    extra: null,
                    status: null,
                  }
                : null,
          },
          mutations: [],
          preparationVersion: '1.0.0',
          executionTimestamp: new Date(serviceIndex).toISOString(),
        }),
      };
    });
    const mutation = await Effect.runPromise(
      makeModelMutations(
        system.aggregates.user['1.0.0'].models.product,
      ).replicate({
        id: 'prd_late',
        modelName: 'product',
        version: '1.0.0',
        name: 'Caller placeholder',
        createdAt: new Date(1),
        updatedAt: new Date(1),
      }),
    );
    const prepared = await Effect.runPromise(
      getReplicatedResources({
        db,
        systemId: 'sys_late',
        services: { app: '1.0.0' },
        mutations: [mutation],
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(inputs.historyRequests).toEqual([{ afterIndex: 42, maxIndex: 45 }]);
    expect(prepared[0]?.operation).toMatchObject({
      serviceIndex: 45,
      resource: {
        id: 'prd_late',
        name: 'Updated after snapshot',
        deletedAt: tombstone ? new Date(45) : null,
      },
    });
    expect(db.select().from(tables.services).get()).toMatchObject({
      lastIndex: 45,
    });
    expect(
      db
        .select()
        .from(system.aggregates.user['1.0.0'].models.product.drizzleSchema)
        .all(),
    ).toEqual([]);

    inputs.history = [];
    const missing = await Effect.runPromise(
      getReplicatedResources({
        db,
        systemId: 'sys_late',
        services: { app: '1.0.0' },
        mutations: [mutation],
      }).pipe(Effect.result, Effect.provide(AsyncLive)),
    );
    expect(missing).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'replica-history-missing' },
    });
    expect(db.select().from(tables.services).get()?.lastIndex).toBe(45);
  },
);

it('records different dispositions when the same guard observes different current replica data', async () => {
  inputs.missing = false;
  inputs.deletedAt = null;
  const sql = await initSqlJs();
  const command = JSON.stringify({
    id: 'cmd_replica_guard',
    commandName: 'replicateProduct',
    contractVersion: '1.0.0',
    aggregateId: 'acct_replica_guard',
    aggregateVersion: '1.0.0',
    aggregateName: 'user',
    systemName: 'system-worker',
    userId: null,
    sessionId: null,
    frontendName: null,
    pushIndex: null,
    payload: JSON.stringify({
      product: JSON.stringify({
        id: 'prd_replica_guard',
        modelName: 'product',
        version: '1.0.0',
        name: 'guard-require-authoritative-copy',
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      }),
    }),
  });
  const checkpoints = new Map<
    string,
    { aggregateIndex: number; commandId: string; dispositionHash: string }
  >();
  for (const [index, version] of ['1.0.0', '2.0.0'].entries()) {
    inputs.sourceName = index === 0 ? 'Authoritative product' : 'Unavailable';
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          otherTables: versionedAggregateRepoTables,
          models: system.aggregates.user['1.0.0'].models,
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
    db.insert(versionedAggregateRepoDbConfig.schema.services)
      .values({
        serviceName: 'app',
        lastIndex: 0,
      })
      .run();
    await Effect.runPromise(
      executeCommands({
        commands: [{ aggregateIndex: 1, command, chainedAt: new Date(1) }],
        db,
        sql,
        execution: Semaphore.makeUnsafe(1),
        key: {
          systemId: 'sys_replica_guard',
          aggregateName: 'user',
          aggregateId: 'acct_replica_guard',
          aggregateVersion: version,
        },
      }).pipe(Effect.provide(AsyncLive), Effect.provide(NanoIdFactory)),
    );
    const result = db
      .select()
      .from(versionedAggregateRepoDbConfig.schema.executedCommands)
      .get();
    if (result === undefined) throw new Error('Expected durable result');
    const entry = Schema.decodeUnknownSync(
      Schema.fromJsonString(AggregateExecutionEntrySchema),
    )(result.entry);
    expect(entry.command.failure?.code ?? null).toBe(
      index === 0 ? null : 'replica-observation-rejected',
    );
    expect(
      db
        .select()
        .from(system.aggregates.user['1.0.0'].models.product.drizzleSchema)
        .all(),
    ).toHaveLength(index === 0 ? 1 : 0);
    const head = db
      .select()
      .from(versionedAggregateRepoDbConfig.schema.head)
      .get();
    if (head === undefined) throw new Error('Expected durable head');
    checkpoints.set(version, {
      aggregateIndex: head.aggregateIndex,
      commandId: entry.command.id,
      dispositionHash: head.dispositionHash,
    });
  }
  expect(checkpoints.get('1.0.0')?.dispositionHash).not.toBe(
    checkpoints.get('2.0.0')?.dispositionHash,
  );
});
