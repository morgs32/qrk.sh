import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  AggregateExecutionEntrySchema,
  ServiceExecutionEntrySchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeModelMutations } from '@zerospin/core/contracts/makeModelMutations';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Schema } from 'effect';
import { system } from 'system';
import { expect, it, vi } from 'vitest';

import {
  userVersionedAggregateRepoDbConfig,
  userVersionedAggregateRepoTables,
} from '../userVersionedAggregateRepoDbConfig.js';

import { execute } from './execute.js';

const source = vi.hoisted(
  (): {
    rows: { outboxIndex: number; entry: string; executionVersion: string }[];
    requests: { afterIndex: number; maxIndex?: number }[];
  } => ({ rows: [], requests: [] }),
);

vi.mock(
  '../../VersionedServiceChain/VersionedServiceChain.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../VersionedServiceChain/VersionedServiceChain.js')
      >();

    Object.assign(actual.VersionedServiceChain, {
      getRepo: () =>
        Effect.succeed({
          replicaFanoutQueue: Promise.resolve({
            getPage: async (request: {
              afterIndex: number;
              maxIndex?: number;
            }) => {
              source.requests.push(request);
              return {
                _tag: 'Success',
                success: {
                  rows: source.rows.filter(
                    row =>
                      row.outboxIndex > request.afterIndex &&
                      row.outboxIndex <= (request.maxIndex ?? Infinity),
                  ),
                  lastIndex: source.rows.at(-1)?.outboxIndex ?? 0,
                },
              };
            },
          }),
        }),
    });
    return actual;
  },
);

it('orders source output independently, backfills late enrollments, and never regresses newer copies or tombstones', async () => {
  const models = system.aggregates.user['1.0.0']!.models;
  const key = {
    systemId: 'sys_sources',
    aggregateId: 'acct_sources',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    userId: 'usr_a',
  };
  const time = new Date('2026-09-07T12:00:00Z');
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: userVersionedAggregateRepoTables,
        models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  // Activation has consumed the first two source positions before any resource enrollment.
  db.insert(userVersionedAggregateRepoDbConfig.schema.services)
    .values({
      serviceName: 'app',
      lastIndex: 2,
    })
    .run();
  source.rows = [];
  source.requests = [];
  for (const [index, id, name, deleted] of [
    [3, 'prd_b', 'B at three', false],
    [4, 'prd_a', 'A at four', false],
    [5, 'prd_b', 'B deleted', true],
    [6, 'prd_c', 'C at six', false],
    [7, 'prd_a', 'A at seven', false],
    [8, 'prd_c', 'C at eight', false],
    [9, 'prd_c', 'C at nine', false],
  ] satisfies readonly (readonly [number, string, string, boolean])[]) {
    const resource = {
      id,
      modelName: 'product',
      version: '1.0.0',
      name,
      createdAt: time,
      updatedAt: time,
      ...(deleted ? { deletedAt: time } : {}),
    };
    const command = {
      id: `cmd_source_${index}`,
      serviceVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: index,
      commandName: 'updateProduct',
      contractVersion: '1.0.0',
      payload: '{}',
      chainedAt: time,
      failedAt: null,
      failure: null,
      dispositionHash: 'a'.repeat(64),
      delta: {
        inserted: [],
        updated: deleted ? [] : [resource],
        deleted: deleted ? [resource] : [],
        mutations: [],
      },
    };
    source.rows.push({
      outboxIndex: index,
      executionVersion: '1.0.0',
      entry: Schema.encodeUnknownSync(
        Schema.fromJsonString(ServiceExecutionEntrySchema),
      )({
        sourceCommand: JSON.stringify(command),
        command,
        mutations: [],
        preparationVersion: '1.0.0',
        executionTimestamp: time,
      }),
    });
  }
  const aggregates = [];
  for (const [aggregateIndex, seeds] of [
    [
      1,
      [
        ['prd_future', 'Future at twenty', 20],
        ['prd_a', 'A seed', 2],
      ],
    ],
    [
      2,
      [
        ['prd_a', 'Stale A seed', 2],
        ['prd_b', 'B seed', 2],
      ],
    ],
    [3, [['prd_c', 'C at eight', 8]]],
  ] satisfies readonly (readonly [
    number,
    readonly (readonly [string, string, number])[],
  ])[]) {
    const mutations = [];
    for (const [resourceId, name, serviceIndex] of seeds) {
      const mutation = await Effect.runPromise(
        makeModelMutations(models.product).replicate({
          id: resourceId,
          modelName: 'product',
          version: '1.0.0',
          name,
          createdAt: time,
          updatedAt: time,
        }),
      );
      mutations.push(
        await Effect.runPromise(
          encodeMutation({
            commandId: `cmd_aggregate_${aggregateIndex}`,
            mutationIndex: mutations.length,
            mutation: {
              ...mutation,
              operation: {
                ...mutation.operation,
                serviceVersion: '1.0.0',
                serviceIndex,
                resource: { ...mutation.operation.resource, serviceIndex },
              },
            },
          }),
        ),
      );
    }
    const command = {
      id: `cmd_aggregate_${aggregateIndex}`,
      commandName: 'replicateProduct',
      contractVersion: '1.0.0',
      payload: '{}',
      systemName: 'system-worker',
      aggregateName: 'user',
      aggregateId: key.aggregateId,
      aggregateIndex,
      userId: key.userId,
      frontendName: 'main',
      sessionId: 'sesn_source',
      pushIndex: aggregateIndex,
      chainedAt: time,
      failedAt: null,
      failure: null,
      delta: null,
      dispositionHash: 'a'.repeat(64),
    };
    aggregates.push({
      outboxIndex: aggregateIndex,
      executionVersion: '1.0.0',
      entry: Schema.encodeUnknownSync(
        Schema.fromJsonString(AggregateExecutionEntrySchema),
      )({
        sourceCommand: JSON.stringify(command),
        command,
        mutations,
        preparationVersion: '1.0.0',
        executionTimestamp: time,
      }),
    });
  }
  await Effect.runPromise(
    execute({ db, key, rows: aggregates.slice(0, 1) }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  expect(
    db.select().from(userVersionedAggregateRepoDbConfig.schema.services).get(),
  ).toMatchObject({
    serviceName: 'app',
    lastIndex: 2,
  });
  const wrongSource = await Effect.runPromise(
    execute({
      db,
      key,
      source: { serviceName: 'inventory', serviceVersion: '1.0.0' },
      rows: source.rows.slice(0, 3),
    }).pipe(Effect.result, Effect.provide(AsyncLive)),
  );
  expect(wrongSource).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'replica-source-not-enrolled' },
  });
  expect(
    db.select().from(userVersionedAggregateRepoDbConfig.schema.services).get()
      ?.lastIndex,
  ).toBe(2);
  await Effect.runPromise(
    execute({
      db,
      key,
      source: { serviceName: 'app', serviceVersion: '1.0.0' },
      rows: source.rows.slice(0, 3),
    }).pipe(Effect.provide(AsyncLive)),
  );
  expect(
    db
      .select()
      .from(models.product.drizzleSchema)
      .all()
      .find(row => row.id === 'prd_a'),
  ).toMatchObject({ name: 'A at four', serviceIndex: 4 });
  expect(
    db
      .select()
      .from(models.product.drizzleSchema)
      .all()
      .some(row => row.id === 'prd_b'),
  ).toBe(false);
  await Effect.runPromise(
    execute({ db, key, rows: aggregates.slice(1, 2) }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  expect(source.requests).toEqual([{ afterIndex: 2, maxIndex: 5 }]);
  const seeded = db.select().from(models.product.drizzleSchema).all();
  expect(seeded.find(row => row.id === 'prd_a')).toMatchObject({
    name: 'A at four',
    serviceIndex: 4,
  });
  expect(seeded.find(row => row.id === 'prd_b')).toMatchObject({
    name: 'B deleted',
    deletedAt: time,
    serviceIndex: 5,
  });
  await Effect.runPromise(
    execute({ db, key, rows: aggregates.slice(2) }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  await Effect.runPromise(
    execute({
      db,
      key,
      source: { serviceName: 'app', serviceVersion: '1.0.0' },
      rows: source.rows.slice(3, 6),
    }).pipe(Effect.provide(AsyncLive)),
  );
  expect(
    db
      .select()
      .from(models.product.drizzleSchema)
      .all()
      .find(row => row.id === 'prd_c'),
  ).toMatchObject({ name: 'C at eight', serviceIndex: 8 });
  db.$client.exec(
    "CREATE TRIGGER reject_delta BEFORE INSERT ON deltas BEGIN SELECT RAISE(ABORT, 'fixture-output-failed'); END",
  );
  const failed = await Effect.runPromise(
    execute({
      db,
      key,
      source: { serviceName: 'app', serviceVersion: '1.0.0' },
      rows: source.rows.slice(6),
    }).pipe(Effect.result, Effect.provide(AsyncLive)),
  );
  expect(failed).toMatchObject({
    _tag: 'Failure',
  });
  expect(
    db.select().from(userVersionedAggregateRepoDbConfig.schema.services).get()
      ?.lastIndex,
  ).toBe(8);
  expect(
    db
      .select()
      .from(models.product.drizzleSchema)
      .all()
      .find(row => row.id === 'prd_c'),
  ).toMatchObject({ name: 'C at eight', serviceIndex: 8 });
  db.$client.exec('DROP TRIGGER reject_delta');
  await Effect.runPromise(
    execute({
      db,
      key,
      source: { serviceName: 'app', serviceVersion: '1.0.0' },
      rows: source.rows.slice(6),
    }).pipe(Effect.provide(AsyncLive)),
  );
  await Effect.runPromise(
    execute({
      db,
      key,
      source: { serviceName: 'app', serviceVersion: '1.0.0' },
      rows: source.rows,
    }).pipe(Effect.provide(AsyncLive)),
  );
  const deltas = db
    .select()
    .from(userVersionedAggregateRepoDbConfig.schema.deltas)
    .all()
    .map(row => JSON.parse(row.output));
  expect(deltas.map(output => output.userIndex)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(deltas.map(output => output.aggregateIndex)).toEqual([
    1, 1, 1, 1, 2, 3, 3, 3, 3, 3,
  ]);
  expect(
    deltas
      .filter(output => output.resolution !== null)
      .map(output => output.resolution.command.id),
  ).toEqual(['cmd_aggregate_1', 'cmd_aggregate_2', 'cmd_aggregate_3']);
  expect(
    db
      .select()
      .from(userVersionedAggregateRepoDbConfig.schema.projectionState)
      .get(),
  ).toMatchObject({ aggregateIndex: 3, userIndex: 10 });
  expect(
    db
      .select()
      .from(models.product.drizzleSchema)
      .all()
      .find(row => row.id === 'prd_c'),
  ).toMatchObject({ name: 'C at nine', serviceIndex: 9 });
  expect(
    db
      .select()
      .from(models.product.drizzleSchema)
      .all()
      .find(row => row.id === 'prd_future'),
  ).toMatchObject({ name: 'Future at twenty', serviceIndex: 20 });
});
