import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { applyMutationInverseTx } from '../aggregateSession/applyAggregateActorCommand/applyMutationInverseTx/applyMutationInverseTx.ts';
import { decodeAppliedMutation } from '../aggregateSession/applyAggregateActorCommand/decodeAppliedMutation/decodeAppliedMutation.ts';
import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/make/makeModelVersion.ts';
import { makeReplica } from '../models/make/makeReplica.ts';

import { applyAggregateMutationTx } from './applyAggregateMutationTx.ts';
import { encodeAppliedMutation } from './encodeAppliedMutation.ts';
import { makeModelMutations } from './make/makeModelMutations.ts';

it('captures, encodes, decodes, and restores transformed JSON snapshots', async () => {
  const item = makeModelVersion(
    defineModel({ name: 'item', abbreviation: 'itm' }),
    {
      version: '1.0.0',
      attributes: {
        details: primitives.json({
          schema: Schema.Struct({ when: Schema.DateFromString }),
        }),
        note: primitives.text(),
      },
      indexes: [],
    },
  );
  const config = makeResourceDbConfig({ models: { item } });
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: config }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  const first = new Date('2026-09-01T00:00:00.000Z');
  const second = new Date('2026-09-02T00:00:00.000Z');
  const third = new Date('2026-09-03T00:00:00.000Z');
  const mutations = makeModelMutations(item);
  const create = Effect.runSync(
    mutations.create({
      resourceId: 'itm_one',
      attributes: { details: { when: first }, note: 'original' },
    }),
  );
  db.transaction(tx =>
    Effect.runSync(
      applyAggregateMutationTx({
        tx,
        mutation: create,
        commandId: 'cmd_create',
        mutationIndex: 0,
        appliedAt: first,
      }),
    ),
  );
  const update = Effect.runSync(
    mutations.update({
      resourceId: 'itm_one',
      attributes: { details: { when: second } },
      mask: ['details'],
    }),
  );
  const appliedUpdate = db.transaction(tx =>
    Effect.runSync(
      applyAggregateMutationTx({
        tx,
        mutation: update,
        commandId: 'cmd_update',
        mutationIndex: 0,
        appliedAt: second,
      }),
    ),
  );
  expect(appliedUpdate.inverseOperation).toEqual({
    attributes: { details: { when: first } },
  });
  const encodedUpdate = Effect.runSync(
    encodeAppliedMutation({ mutation: appliedUpdate }),
  );
  const decodedUpdate = Effect.runSync(
    decodeAppliedMutation({ mutation: encodedUpdate, model: item }),
  );
  db.transaction(tx =>
    Effect.runSync(applyMutationInverseTx({ tx, mutation: decodedUpdate })),
  );
  expect(db.query.item.findFirst().sync()).toMatchObject({
    details: { when: first },
    note: 'original',
    updatedAt: first,
  });
  expect(db.select().from(config.schema.item).get()?.details).toBe(
    JSON.stringify({ when: first.toISOString() }),
  );

  const remove = Effect.runSync(mutations.delete({ resourceId: 'itm_one' }));
  const appliedDelete = db.transaction(tx =>
    Effect.runSync(
      applyAggregateMutationTx({
        tx,
        mutation: remove,
        commandId: 'cmd_delete',
        mutationIndex: 0,
        appliedAt: third,
      }),
    ),
  );
  expect(db.query.item.findFirst().sync()).toBeUndefined();
  const encodedDelete = Effect.runSync(
    encodeAppliedMutation({ mutation: appliedDelete }),
  );
  const decodedDelete = Effect.runSync(
    decodeAppliedMutation({ mutation: encodedDelete, model: item }),
  );
  db.transaction(tx =>
    Effect.runSync(applyMutationInverseTx({ tx, mutation: decodedDelete })),
  );
  expect(db.query.item.findFirst().sync()).toMatchObject({
    details: { when: first },
    note: 'original',
    updatedAt: first,
  });
  expect(db.select().from(config.schema.item).get()?.details).toBe(
    JSON.stringify({ when: first.toISOString() }),
  );
});

it('preserves previous replica snapshots, first replication, and tombstone restoration', async () => {
  const source = makeModelVersion(
    defineModel({ name: 'item', abbreviation: 'itm' }),
    {
      version: '1.0.0',
      attributes: {
        details: primitives.json({
          schema: Schema.Struct({ when: Schema.DateFromString }),
        }),
      },
      indexes: [],
    },
  );
  const replica = makeReplica({
    sourceModel: source,
    serviceName: 'catalog',
    serviceVersion: '1.0.0',
  });
  const config = makeResourceDbConfig({ models: { item: replica } });
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: config }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  const first = new Date('2026-09-01T00:00:00.000Z');
  const second = new Date('2026-09-02T00:00:00.000Z');
  const resource = {
    id: 'itm_one',
    modelName: 'item',
    version: '1.0.0',
    createdAt: first,
    updatedAt: first,
    details: { when: first },
  } as const;
  const mutations = makeModelMutations(replica);
  const initial = Effect.runSync(mutations.replicate(resource));
  const firstApplied = db.transaction(tx =>
    Effect.runSync(
      applyAggregateMutationTx({
        tx,
        mutation: initial,
        commandId: 'cmd_first',
        mutationIndex: 0,
        appliedAt: first,
      }),
    ),
  );
  expect(firstApplied.inverseOperation).toBeNull();
  expect(db.query.item.findFirst().sync()?.details).toEqual({ when: first });
  expect(db.select().from(config.schema.item).get()?.details).toBe(
    JSON.stringify({ when: first.toISOString() }),
  );

  const next = Effect.runSync(
    mutations.replicate({
      ...resource,
      updatedAt: second,
      details: { when: second },
    }),
  );
  const nextApplied = db.transaction(tx =>
    Effect.runSync(
      applyAggregateMutationTx({
        tx,
        mutation: next,
        commandId: 'cmd_second',
        mutationIndex: 0,
        appliedAt: second,
      }),
    ),
  );
  expect(nextApplied.inverseOperation).toMatchObject({
    resource: { details: { when: first } },
  });
  const encoded = Effect.runSync(
    encodeAppliedMutation({ mutation: nextApplied }),
  );
  const decoded = Effect.runSync(
    decodeAppliedMutation({ mutation: encoded, model: replica }),
  );
  db.transaction(tx =>
    Effect.runSync(applyMutationInverseTx({ tx, mutation: decoded })),
  );
  expect(db.query.item.findFirst().sync()?.details).toEqual({ when: first });

  const remove = Effect.runSync(mutations.delete({ resourceId: 'itm_one' }));
  const removed = db.transaction(tx =>
    Effect.runSync(
      applyAggregateMutationTx({
        tx,
        mutation: remove,
        commandId: 'cmd_remove',
        mutationIndex: 0,
        appliedAt: second,
      }),
    ),
  );
  expect(db.query.item.findFirst().sync()?.deletedAt).toEqual(second);
  const encodedRemoval = Effect.runSync(
    encodeAppliedMutation({ mutation: removed }),
  );
  const decodedRemoval = Effect.runSync(
    decodeAppliedMutation({ mutation: encodedRemoval, model: replica }),
  );
  db.transaction(tx =>
    Effect.runSync(applyMutationInverseTx({ tx, mutation: decodedRemoval })),
  );
  expect(db.query.item.findFirst().sync()).toMatchObject({
    details: { when: first },
    deletedAt: null,
  });
  expect(db.select().from(config.schema.item).get()?.details).toBe(
    JSON.stringify({ when: first.toISOString() }),
  );
});
