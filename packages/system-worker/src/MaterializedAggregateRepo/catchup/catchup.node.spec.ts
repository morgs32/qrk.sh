import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { ZerospinError } from '@zerospin/error';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makeMaterializedAggregateRepoDbConfig,
  materializedAggregateRepoDrizzleSchemas,
} from '../MaterializedAggregateRepoDbConfig.js';

import { catchup } from './catchup.js';

const aggregateHistory = vi.hoisted(() => ({ getCommands: vi.fn() }));

vi.mock(
  '../../AggregateCommandChain/getAggregateCommandChain/getAggregateCommandChain.js',
  async () => {
    const { Effect } = await import('effect');
    return {
      getAggregateCommandChain: Effect.fn('getAggregateCommandChain.test')(
        function* () {
          yield* Effect.void;
          return aggregateHistory;
        },
      ),
    };
  },
);

describe('MaterializedAggregateRepo.catchup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pulls and retains contiguous terminal history across the 64-command page boundary', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const commands: Schema.Schema.Type<typeof AggregateChainedCommandSchema>[] =
      [];
    for (let aggregateIndex = 1; aggregateIndex <= 65; aggregateIndex += 1) {
      commands.push(
        Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
          id: `cmd_materialized_page_${aggregateIndex}`,
          commandName: 'missingContract',
          payload: '{}',
          contractVersion: '1.0.0',
          aggregateId: 'acct_materialized_page',
          aggregateName: 'user',
          systemName: 'system-worker',
          sessionId: null,
          userId: null,
          frontendName: null,
          pushIndex: null,
          aggregateIndex,
          chainedAt: new Date(aggregateIndex * 1_000).toISOString(),
          delta: { inserted: [], updated: [], deleted: [], mutations: [] },
          failedAt: new Date(aggregateIndex * 1_000 + 1).toISOString(),
          failure: Schema.encodeSync(ZerospinError.schema)(
            new ZerospinError({
              code: 'fixture-aggregate-command-failed',
              message: 'Fixture failure',
            }),
          ),
        }),
      );
    }
    aggregateHistory.getCommands.mockImplementation(
      ({ afterAggregateIndex }: { afterAggregateIndex: number | null }) => {
        const offset = afterAggregateIndex ?? 0;
        return Promise.resolve({
          _tag: 'Success',
          success: {
            commands: commands.slice(offset, offset + 64),
            tip: 65,
          },
        });
      },
    );

    await Effect.runPromise(
      catchup({
        db,
        key: {
          systemId: 'sys_test',
          aggregateId: 'acct_materialized_page',
          aggregateName: 'user',
        },
        throughAggregateIndex: undefined,
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(aggregateHistory.getCommands).toHaveBeenCalledTimes(2);
    expect(aggregateHistory.getCommands).toHaveBeenNthCalledWith(1, {
      afterAggregateIndex: null,
    });
    expect(aggregateHistory.getCommands).toHaveBeenNthCalledWith(2, {
      afterAggregateIndex: 64,
    });
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
        .all(),
    ).toHaveLength(65);
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.materializationState)
        .get(),
    ).toEqual({ id: 1, aggregateIndex: 65 });
  });

  it('rejects a source-history gap without advancing or retaining the later occurrence', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const command = Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
      id: 'cmd_materialized_gap',
      commandName: 'missingContract',
      payload: '{}',
      contractVersion: '1.0.0',
      aggregateId: 'acct_materialized_gap',
      aggregateName: 'user',
      systemName: 'system-worker',
      sessionId: null,
      userId: null,
      frontendName: null,
      pushIndex: null,
      aggregateIndex: 2,
      chainedAt: '2026-08-31T16:04:00.000Z',
      delta: { inserted: [], updated: [], deleted: [], mutations: [] },
      failedAt: '2026-08-31T16:04:01.000Z',
      failure: Schema.encodeSync(ZerospinError.schema)(
        new ZerospinError({
          code: 'fixture-aggregate-command-failed',
          message: 'Fixture failure',
        }),
      ),
    });
    aggregateHistory.getCommands.mockResolvedValue({
      _tag: 'Success',
      success: { commands: [command], tip: 2 },
    });

    const result = await Effect.runPromise(
      catchup({
        db,
        key: {
          systemId: 'sys_test',
          aggregateId: 'acct_materialized_gap',
          aggregateName: 'user',
        },
        throughAggregateIndex: 2,
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe(
        'materialized-aggregate-catchup-index-gap',
      );
    }
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
        .all(),
    ).toEqual([]);
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.materializationState)
        .all(),
    ).toEqual([]);
  });

  it('rejects an empty page whose observed terminal tip is still ahead', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    aggregateHistory.getCommands.mockResolvedValue({
      _tag: 'Success',
      success: { commands: [], tip: 1 },
    });

    const result = await Effect.runPromise(
      catchup({
        db,
        key: {
          systemId: 'sys_test',
          aggregateId: 'acct_materialized_missing_page',
          aggregateName: 'user',
        },
        throughAggregateIndex: undefined,
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe(
        'materialized-aggregate-catchup-history-incomplete',
      );
    }
  });

  it('replays a terminal replica deletion as the same retained tombstone', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const createdAt = new Date('2026-08-31T16:07:00.000Z');
    db.insert(system.aggregates.user.models.product.drizzleSchema)
      .values({
        id: 'prd_materialized_catchup_deleted',
        modelName: 'product',
        name: 'Deleted by source',
        version: '1.0.0',
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      })
      .run();
    const command = Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
      id: 'cmd_materialized_catchup_deleted',
      commandName: 'deleteProduct',
      payload: '{"id":"prd_materialized_catchup_deleted"}',
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 8,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T16:07:01.000Z',
      delta: {
        inserted: [],
        updated: [],
        deleted: [
          {
            id: 'prd_materialized_catchup_deleted',
            modelName: 'product',
            name: 'Deleted by source',
            version: '1.0.0',
            createdAt: '2026-08-31T16:07:00.000Z',
            updatedAt: '2026-08-31T16:07:02.000Z',
            deletedAt: '2026-08-31T16:07:02.000Z',
          },
        ],
        mutations: [],
      },
      failedAt: null,
      failure: null,
    });
    aggregateHistory.getCommands.mockResolvedValue({
      _tag: 'Success',
      success: { commands: [command], tip: 1 },
    });

    await Effect.runPromise(
      catchup({
        db,
        key: {
          systemId: 'sys_test',
          aggregateId: 'acct_materialized_catchup_deleted',
          aggregateName: 'user',
        },
        throughAggregateIndex: 1,
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(
      db
        .select()
        .from(system.aggregates.user.models.product.drizzleSchema)
        .get(),
    ).toMatchObject({
      id: 'prd_materialized_catchup_deleted',
      deletedAt: new Date('2026-08-31T16:07:02.000Z'),
    });
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
        .get()?.result,
    ).not.toBeNull();
  });
});
