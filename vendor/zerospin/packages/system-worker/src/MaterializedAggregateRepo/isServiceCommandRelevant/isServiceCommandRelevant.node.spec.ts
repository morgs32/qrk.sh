import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';
import { describe, expect, it } from 'vitest';

import { makeMaterializedAggregateRepoDbConfig } from '../MaterializedAggregateRepoDbConfig.js';

import { isServiceCommandRelevant } from './isServiceCommandRelevant.js';

describe('MaterializedAggregateRepo.isServiceCommandRelevant', () => {
  it('requires a terminal occurrence that changes an existing matching service replica', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const createdAt = new Date('2026-08-31T16:05:00.000Z');
    db.insert(system.aggregates.user.models.product.drizzleSchema)
      .values({
        id: 'prd_materialized_relevant',
        modelName: 'product',
        name: 'Before',
        version: '1.0.0',
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      })
      .run();
    const relevant = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      id: 'cmd_materialized_relevant',
      commandName: 'updateProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 1,
      chainedAt: '2026-08-31T16:05:01.000Z',
      delta: {
        inserted: [],
        updated: [
          {
            id: 'prd_materialized_relevant',
            modelName: 'product',
            name: 'After',
            version: '1.0.0',
            createdAt: '2026-08-31T16:05:00.000Z',
            updatedAt: '2026-08-31T16:05:01.000Z',
          },
        ],
        deleted: [],
        mutations: [],
      },
      failedAt: null,
      failure: null,
    });
    const irrelevant = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      ...Schema.encodeSync(ServiceChainedCommandSchema)(relevant),
      id: 'cmd_materialized_irrelevant',
      serviceIndex: 2,
      delta: {
        inserted: [],
        updated: [
          {
            id: 'prd_materialized_absent',
            modelName: 'product',
            name: 'Absent',
            version: '1.0.0',
            createdAt: '2026-08-31T16:05:00.000Z',
            updatedAt: '2026-08-31T16:05:02.000Z',
          },
        ],
        deleted: [],
        mutations: [],
      },
    });
    const pending = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      id: 'cmd_materialized_pending',
      commandName: 'updateProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 3,
      chainedAt: '2026-08-31T16:05:03.000Z',
      delta: null,
      failedAt: null,
      failure: null,
    });

    expect(
      await Effect.runPromise(
        isServiceCommandRelevant({
          aggregateName: 'user',
          command: relevant,
          db,
        }),
      ),
    ).toBe(true);
    expect(
      await Effect.runPromise(
        isServiceCommandRelevant({
          aggregateName: 'user',
          command: irrelevant,
          db,
        }),
      ),
    ).toBe(false);

    const pendingResult = await Effect.runPromise(
      isServiceCommandRelevant({
        aggregateName: 'user',
        command: pending,
        db,
      }).pipe(Effect.result),
    );
    expect(Result.isFailure(pendingResult)).toBe(true);
    if (Result.isFailure(pendingResult)) {
      expect(pendingResult.failure.code).toBe(
        'materialized-aggregate-service-command-pending',
      );
    }
  });
});
