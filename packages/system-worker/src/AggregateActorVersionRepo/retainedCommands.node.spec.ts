import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { aggregateActorVersionRepoDbConfig } from './aggregateActorVersionRepoDbConfig.js';
import { commandRowForSource } from './retainedCommands.js';
import { makeActorSnapshotDb } from './validateCommands/makeActorSnapshotDb.js';

it('keeps one command ID in distinct aggregate and service source scopes', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const { db } = yield* makeActorSnapshotDb(
        makeResourceDbConfig({
          models: {},
          otherTables: aggregateActorVersionRepoDbConfig.tables,
        }),
      );
      const tables = aggregateActorVersionRepoDbConfig.schema;
      const common = {
        id: 'cmd_shared',
        commandName: 'record',
        contractVersion: '1.0.0',
        payload: '{}',
        aggregateId: null,
        aggregateName: null,
        aggregateVersion: null,
        systemName: null,
        actorName: null,
        actorVersion: null,
        claims: null,
        nodeId: null,
        sessionName: null,
        nodeIndex: null,
        serviceName: null,
        serviceVersion: null,
        aggregateIndex: null,
        serviceIndex: null,
        admission: null,
        execution: null,
        dispositionHash: null,
        executedIndex: null,
        executedHash: null,
        actorAggregateIndex: null,
        actorDelta: null,
        acknowledgedAt: null,
        lastDeliveryFailure: null,
      };
      db.insert(tables.commands)
        .values([
          {
            ...common,
            rowId: 'row_aggregate',
            aggregateId: 'acct_one',
            aggregateName: 'shop',
          },
          { ...common, rowId: 'row_service_a', serviceName: 'inventory' },
          { ...common, rowId: 'row_service_b', serviceName: 'fulfillment' },
        ])
        .run();
      expect(
        commandRowForSource(db, {
          id: 'cmd_shared',
          aggregateId: 'acct_one',
          aggregateName: 'shop',
        })?.rowId,
      ).toBe('row_aggregate');
      expect(
        commandRowForSource(db, {
          id: 'cmd_shared',
          serviceName: 'inventory',
        })?.rowId,
      ).toBe('row_service_a');
      expect(
        commandRowForSource(db, {
          id: 'cmd_shared',
          serviceName: 'fulfillment',
        })?.rowId,
      ).toBe('row_service_b');
      expect(() =>
        db
          .insert(tables.commands)
          .values({
            ...common,
            rowId: 'row_conflict',
            serviceName: 'inventory',
          })
          .run(),
      ).toThrow();
      expect(db.select().from(tables.commands).all()).toHaveLength(3);
    }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
  );
});
