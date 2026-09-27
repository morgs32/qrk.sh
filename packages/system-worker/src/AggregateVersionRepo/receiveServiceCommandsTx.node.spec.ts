import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { IAnyModels } from '@zerospin/core/models/types';
import config from 'config';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { serviceVersionChainDbConfig } from '../ServiceVersionChain/serviceVersionChainDbConfig.js';

import { aggregateVersionRepoDbConfig } from './aggregateVersionRepoDbConfig.js';
import { receiveServiceCommandsTx } from './receiveServiceCommandsTx.js';

it('retains a local inverse when an enrolled replica receives a service update', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const aggregate = config.system.aggregates.user?.['1.0.0'];
      if (aggregate === undefined) throw new Error('Missing aggregate fixture');
      const registered: IAnyModels = aggregate.models;
      const replica = registered.product;
      if (replica === undefined) throw new Error('Missing replica model');
      const { db } = yield* makeActorSnapshotDb(
        makeResourceDbConfig({
          models: registered,
          otherTables: aggregateVersionRepoDbConfig.tables,
        }),
      );
      const at = new Date('2026-09-25T12:00:00.000Z');
      db.insert(aggregateVersionRepoDbConfig.schema.head)
        .values({
          singletonId: 1,
          aggregateIndex: 0,
          executedIndex: 0,
          dispositionHash: 'a'.repeat(64),
        })
        .run();
      db.insert(aggregateVersionRepoDbConfig.schema.services)
        .values({
          serviceName: 'app',
          lastIndex: 0,
        })
        .run();
      db.run(sql`INSERT INTO product (id, modelName, version, name, createdAt, updatedAt, deletedAt, serviceIndex)
      VALUES ('prd_one', 'product', '1.0.0', 'Old', ${at.getTime()}, ${at.getTime()}, NULL, 0)`);
      const source =
        yield* serviceVersionChainDbConfig.tables.commands.encodeRow({
          id: 'cmd_one',
          commandName: 'updateProduct',
          payload: '{}',
          contractVersion: '1.0.0',
          serviceName: 'app',
          serviceVersion: '1.0.0',
          serviceIndex: 1,
          executionVersion: '1.0.0',
          dispositionHash: 'b'.repeat(64),
          admission: { status: 'succeeded', startedAt: at, completedAt: at },
          execution: {
            status: 'succeeded',
            startedAt: at,
            completedAt: at,
            executionDelta: {
              inserted: [],
              updated: [
                {
                  id: 'prd_one',
                  modelName: 'product',
                  version: '1.0.0',
                  name: 'New',
                  createdAt: at,
                  updatedAt: at,
                  deletedAt: null,
                },
              ],
              deleted: [],
            },
          },
        });
      yield* receiveServiceCommandsTx(db, {
        rows: [source],
        sourceKey: {
          systemId: 'sys_one',
          serviceName: 'app',
          serviceVersion: '1.0.0',
        },
        aggregate,
      });
      const rows = db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.mutations)
        .all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: '1/0',
        executedIndex: 1,
        commandId: 'cmd_one',
        operationName: 'replicate',
        mutationIndex: 0,
      });
      expect(JSON.parse(rows[0]?.inverseOperation ?? '')).toMatchObject({
        resource: { name: 'Old' },
      });
      expect(db.select().from(replica.drizzleSchema).get()).toMatchObject({
        name: 'New',
        serviceIndex: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
  );
});
