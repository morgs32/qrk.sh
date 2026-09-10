import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeModelMutations } from '@zerospin/core/contracts/makeModelMutations';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect } from 'effect';
import { system } from 'system';
import { expect, it } from 'vitest';

import {
  frontendVersionedServiceRepoDbConfig,
  frontendVersionedServiceRepoTables,
} from '../frontendVersionedServiceRepoDbConfig.js';

import { execute } from './execute.js';
it('rejects a gapped page without advancing the projection or output', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: frontendVersionedServiceRepoTables,
        models: system.services.app['1.0.0'].models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  const result = await Effect.runPromise(
    execute({
      db,
      key: {
        systemId: 'sys_test',
        serviceName: 'app',
        serviceVersion: '1.0.0',
        userId: 'usr_test',
        frontendName: 'products',
      },
      rows: [{ outboxIndex: 2, entry: '{}', executionVersion: '1.0.0' }],
    }).pipe(Effect.result),
  );
  expect(result._tag).toBe('Failure');
  expect(
    db
      .select()
      .from(frontendVersionedServiceRepoDbConfig.schema.projectionState)
      .all(),
  ).toHaveLength(0);
  expect(
    db.select().from(frontendVersionedServiceRepoDbConfig.schema.deltas).all(),
  ).toHaveLength(0);
});

it('rolls back source state and every output when projection fails, then retries the whole page', async () => {
  const { ServiceExecutionEntrySchema } =
    await import('@zerospin/core/contracts/CommandSchema');
  const { encodeAppliedMutation } =
    await import('@zerospin/core/contracts/encodeAppliedMutation');
  const { Schema } = await import('effect');
  const product = system.services.app['1.0.0'].models.product;
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: frontendVersionedServiceRepoTables,
        models: system.services.app['1.0.0'].models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  const key = {
    systemId: 'sys_test',
    serviceName: 'app',
    serviceVersion: '1.0.0',
    userId: 'usr_test',
    frontendName: 'products',
  };
  const rows = await Effect.runPromise(
    Effect.forEach([1, 2], index =>
      Effect.gen(function* () {
        const mutation = yield* makeModelMutations(product).create({
          resourceId: `prd_projection${index}`,
          attributes: { name: `Product ${index}` },
        });
        return {
          outboxIndex: index,
          executionVersion: '1.0.0',
          entry: Schema.encodeSync(
            Schema.fromJsonString(ServiceExecutionEntrySchema),
          )({
            sourceCommand: '{}',
            preparationVersion: '1.0.0',
            executionTimestamp: new Date(index),
            mutations: [
              yield* encodeAppliedMutation({
                mutation: {
                  ...mutation,
                  commandId: `cmd_projection${index}`,
                  mutationIndex: 0,
                  appliedAt: new Date(index),
                  lastAppliedAt: null,
                  inverseOperation: null,
                },
              }),
            ],
            command: {
              id: `cmd_projection${index}`,
              serviceVersion: '1.0.0',
              serviceName: 'app',
              commandName: 'createProduct',
              contractVersion: '1.0.0',
              payload: '{}',
              serviceIndex: index,
              chainedAt: new Date(index),
              dispositionHash: 'a'.repeat(64),
              failedAt: null,
              failure: null,
              delta: { inserted: [], updated: [], deleted: [], mutations: [] },
            },
          }),
        };
      }),
    ),
  );
  // The existing projector validates the persisted source; corrupt only the second inserted source row.
  db.run(
    "CREATE TRIGGER corrupt_projection AFTER INSERT ON product WHEN NEW.id = 'prd_projection2' BEGIN UPDATE product SET createdAt = 'invalid-date' WHERE id = NEW.id; END",
  );
  const failed = await Effect.runPromise(
    execute({ db, key, rows }).pipe(Effect.result),
  );
  expect(failed._tag).toBe('Failure');
  expect(db.select().from(product.drizzleSchema).all()).toHaveLength(0);
  expect(
    db.select().from(frontendVersionedServiceRepoDbConfig.schema.deltas).all(),
  ).toHaveLength(0);
  db.run('DROP TRIGGER corrupt_projection');
  await Effect.runPromise(execute({ db, key, rows }));
  expect(db.select().from(product.drizzleSchema).all()).toHaveLength(2);
  expect(
    db
      .select()
      .from(frontendVersionedServiceRepoDbConfig.schema.deltas)
      .all()
      .map(row => row.outboxIndex),
  ).toEqual([1, 2]);
});
