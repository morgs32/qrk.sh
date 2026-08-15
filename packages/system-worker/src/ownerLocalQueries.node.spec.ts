import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemorySqljsDb } from '@zerospin/core/drizzle/makeMigratedInMemorySqljsDb';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { Effect, Either } from 'effect';
import { describe, expect } from 'vitest';

import { authorizeAggregateFrontend } from './AggregateRepo/authorizeAggregateFrontend/authorizeAggregateFrontend.js';
import { system } from './fixtures/system.js';
import { authorizeServiceFrontend } from './ServiceRepo/authorizeServiceFrontend/authorizeServiceFrontend.js';
import { executeServiceQuery } from './ServiceRepo/executeServiceQuery/executeServiceQuery.js';

describe('owner-local authored queries', () => {
  it.effect(
    'runs aggregate authorization against the authoritative aggregate model query',
    () =>
      Effect.gen(function* () {
        const aggregate = system.aggregates.user;
        const db = yield* makeMigratedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({ models: aggregate.models }),
        });
        const now = new Date('2026-01-01T00:00:00.000Z');
        const userId = aggregate.models.user.prefixId('owner-local-query');
        db.insert(aggregate.models.user.drizzleSchema)
          .values({
            id: userId,
            modelName: aggregate.models.user.modelName,
            name: 'Owner local query',
            version: aggregate.models.user.version,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        yield* authorizeAggregateFrontend({
          aggregateId: makeAggregateId({ id: 'owner-local-query' }),
          aggregateName: aggregate.name,
          frontendName: 'main',
          userId,
          db,
        });

        db.delete(aggregate.models.user.drizzleSchema).run();
        const missing = yield* authorizeAggregateFrontend({
          aggregateId: makeAggregateId({ id: 'owner-local-query' }),
          aggregateName: aggregate.name,
          frontendName: 'main',
          userId,
          db,
        }).pipe(Effect.either);
        expect(Either.isLeft(missing)).toBe(true);
        if (Either.isLeft(missing)) {
          expect(missing.left.code).toBe('user-not-found');
        }
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'runs service authorization and queries against only service model queries',
    () =>
      Effect.gen(function* () {
        const service = system.services.app;
        const db = yield* makeMigratedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({ models: service.models }),
        });
        const now = new Date('2026-01-01T00:00:00.000Z');
        const productId = service.models.product.prefixId('owner-local-query');
        db.insert(service.models.product.drizzleSchema)
          .values({
            id: productId,
            modelName: service.models.product.modelName,
            name: 'Owner local product',
            version: service.models.product.version,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .run();

        yield* authorizeServiceFrontend({
          serviceName: service.name,
          frontendName: 'products',
          userId: 'owner-local-user',
          db,
        });
        const products = yield* executeServiceQuery({
          serviceName: service.name,
          queryName: 'getProducts',
          params: {},
          db,
        });

        expect(products).toEqual([
          { id: productId, name: 'Owner local product' },
        ]);
      }).pipe(Effect.provide(AsyncLive)),
  );
});
