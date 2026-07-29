/*
 * System-worker annotation:
 * Exercises ActorRepo bootstrap against a snapshot larger than workerd
 * SQLite's per-statement bind-variable limit.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { asc } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AccountRepo } from '../AccountRepo/AccountRepo.js';
import { getAccountRepo } from '../AccountRepo/getAccountRepo/getAccountRepo.js';
import { main } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { ActorRepo } from './ActorRepo.js';
import { getActorRepo } from './getActorRepo/getActorRepo.js';

describe('ActorRepo bootstrap', () => {
  it.effect(
    'copies a large selected snapshot and its complete graph',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_actor_bootstrap_large_snapshot',
          accountId: makeAccountId({ id: 'actor-bootstrap-large-snapshot' }),
          accountName: main.accountName,
          actorId: prefixActorId('actor-bootstrap-large-snapshot'),
          actorName: main.actorName,
        };

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAccountRepo,
            repo: AccountRepo,
            key: {
              generationId: key.generationId,
              accountId: key.accountId,
              accountName: key.accountName,
            },
            fn: ({ storage }) => {
              // Seed one selected model with enough complete resources that
              // either the old snapshot insert or the old graph insert would
              // compile more bind variables than workerd SQLite accepts.
              storage.sql.exec(`
                WITH RECURSIVE snapshotProducts(resourceIndex) AS (
                  SELECT 1
                  UNION ALL
                  SELECT resourceIndex + 1
                  FROM snapshotProducts
                  WHERE resourceIndex < 201
                )
                INSERT INTO product (
                  id,
                  modelName,
                  name,
                  version,
                  createdAt,
                  updatedAt,
                  deletedAt
                )
                SELECT
                  'prd_actor_bootstrap_' || printf('%03d', resourceIndex),
                  'product',
                  'Actor bootstrap product ' || resourceIndex,
                  '1.0.0',
                  0,
                  0,
                  NULL
                FROM snapshotProducts
              `);
            },
          }),
        );

        const actorSnapshot = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getActorRepo,
            repo: ActorRepo,
            key,
            fn: ({ db, schema }) => ({
              products: db.select().from(schema.product).all(),
              graphRows: db
                .select()
                .from(schema.graph)
                .orderBy(asc(schema.graph.resourceId))
                .all(),
            }),
          }),
        );

        expect(actorSnapshot.products).toHaveLength(201);
        expect(actorSnapshot.graphRows).toHaveLength(201);
        expect(actorSnapshot.graphRows[0]).toEqual({
          resourceId: 'prd_actor_bootstrap_001',
          modelName: 'product',
        });
        expect(actorSnapshot.graphRows[200]).toEqual({
          resourceId: 'prd_actor_bootstrap_201',
          modelName: 'product',
        });
      }).pipe(Effect.provide(AsyncLive)),
  );
});
