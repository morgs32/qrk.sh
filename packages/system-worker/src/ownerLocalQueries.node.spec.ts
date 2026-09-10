import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { Effect, Result } from 'effect';
import { describe, expect } from 'vitest';

import { system } from './fixtures/system.js';
import { authorizeAggregateFrontend } from './VersionedAggregateRepo/authorizeAggregateFrontend/authorizeAggregateFrontend.js';
import { authorizeServiceFrontend } from './VersionedServiceRepo/authorizeServiceFrontend/authorizeServiceFrontend.js';
import { executeServiceQuery } from './VersionedServiceRepo/executeServiceQuery/executeServiceQuery.js';

describe('owner-local authored queries', () => {
  it.effect(
    'runs aggregate authorization against the authoritative aggregate model query',
    () =>
      Effect.gen(function* () {
        const aggregate = system.aggregates.user['1.0.0'];
        const db = yield* makeProvisionedInMemorySqljsDb({
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
          aggregateVersion: aggregate.version,
          frontendName: 'main',
          userId,
          db,
        });

        db.delete(aggregate.models.user.drizzleSchema).run();
        const missing = yield* authorizeAggregateFrontend({
          aggregateId: makeAggregateId({ id: 'owner-local-query' }),
          aggregateName: aggregate.name,
          aggregateVersion: aggregate.version,
          frontendName: 'main',
          userId,
          db,
        }).pipe(Effect.result);
        expect(Result.isFailure(missing)).toBe(true);
        if (Result.isFailure(missing)) {
          expect(missing.failure.code).toBe('user-not-found');
        }
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'runs service authorization and queries against only service model queries',
    () =>
      Effect.gen(function* () {
        const service = system.services.app['1.0.0'];
        const db = yield* makeProvisionedInMemorySqljsDb({
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
          })
          .run();

        yield* authorizeServiceFrontend({
          serviceName: service.name,
          serviceVersion: service.version,
          frontendName: 'products',
          userId: 'owner-local-user',
          db,
        });
        const products = yield* executeServiceQuery({
          serviceName: service.name,
          serviceVersion: service.version,
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
