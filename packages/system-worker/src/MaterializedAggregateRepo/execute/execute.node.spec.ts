import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makeMaterializedAggregateRepoDbConfig,
  materializedAggregateRepoDrizzleSchemas,
} from '../MaterializedAggregateRepoDbConfig.js';

import { execute } from './execute.js';

const aggregateHistory = vi.hoisted(() => ({
  getCommands: vi.fn(),
  subscribeService: vi.fn(),
}));
const serviceHistory = vi.hoisted(() => ({ getCommands: vi.fn() }));
const materializedService = vi.hoisted(() => ({
  getReplicatedResources: vi.fn(),
}));

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

vi.mock(
  '../../ServiceCommandChain/getServiceCommandChain/getServiceCommandChain.js',
  async () => {
    const { Effect } = await import('effect');
    return {
      getServiceCommandChain: Effect.fn('getServiceCommandChain.test')(
        function* () {
          yield* Effect.void;
          return serviceHistory;
        },
      ),
    };
  },
);

vi.mock(
  '../../MaterializedServiceRepo/getMaterializedServiceRepo/getMaterializedServiceRepo.js',
  async () => {
    const { Effect } = await import('effect');
    return {
      getMaterializedServiceRepo: Effect.fn('getMaterializedServiceRepo.test')(
        function* () {
          yield* Effect.void;
          return materializedService;
        },
      ),
    };
  },
);

describe('MaterializedAggregateRepo.execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aggregateHistory.getCommands.mockResolvedValue({
      _tag: 'Success',
      success: { commands: [], tip: null },
    });
    aggregateHistory.subscribeService.mockResolvedValue({
      _tag: 'Success',
      success: undefined,
    });
    serviceHistory.getCommands.mockResolvedValue({
      _tag: 'Success',
      success: { commands: [], tip: null },
    });
  });

  it('retains one exact terminal result and rejects changed bytes at the same index', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const payload = await Effect.runPromise(
      system.aggregates.user.contracts.createUser.encodePayload({
        payload: { id: 'usr_materialized_once', name: 'One' },
      }),
    );
    const command = Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
      id: 'cmd_materialized_once',
      commandName: 'createUser',
      payload,
      contractVersion: '1.0.0',
      aggregateId: 'acct_materialized_once',
      aggregateName: 'user',
      systemName: 'system-worker',
      sessionId: null,
      userId: null,
      frontendName: null,
      pushIndex: null,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T16:00:00.000Z',
      delta: null,
      failedAt: null,
      failure: null,
    });
    const key = {
      systemId: 'sys_test',
      aggregateId: 'acct_materialized_once',
      aggregateName: 'user',
    };

    const terminal = await Effect.runPromise(
      execute({ command, db, key }).pipe(Effect.provide(AsyncLive)),
    );
    const retainedBytes = db
      .select()
      .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
      .get()?.result;
    const duplicate = await Effect.runPromise(
      execute({ command, db, key }).pipe(Effect.provide(AsyncLive)),
    );

    expect(terminal.delta?.inserted).toHaveLength(1);
    expect(terminal.delta?.mutations).toHaveLength(1);
    expect(duplicate).toEqual(terminal);
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
        .get()?.result,
    ).toBe(retainedBytes);
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
        .all(),
    ).toHaveLength(1);

    const conflict = await Effect.runPromise(
      execute({
        command: { ...command, payload: '{"changed":true}' },
        db,
        key,
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(conflict)).toBe(true);
    if (Result.isFailure(conflict)) {
      expect(conflict.failure.code).toBe(
        'materialized-aggregate-command-conflict',
      );
    }
  });

  it('halts an exact retry when its persisted claim has no terminal result', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const payload = await Effect.runPromise(
      system.aggregates.user.contracts.createUser.encodePayload({
        payload: { id: 'usr_materialized_in_doubt', name: 'In doubt' },
      }),
    );
    const command = Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
      id: 'cmd_materialized_in_doubt',
      commandName: 'createUser',
      payload,
      contractVersion: '1.0.0',
      aggregateId: 'acct_materialized_in_doubt',
      aggregateName: 'user',
      systemName: 'system-worker',
      sessionId: null,
      userId: null,
      frontendName: null,
      pushIndex: null,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T16:01:00.000Z',
      delta: null,
      failedAt: null,
      failure: null,
    });
    const canonicalBytes = Schema.encodeSync(
      Schema.fromJsonString(EncodedAggregateCommandSchema),
    )({
      id: command.id,
      commandName: command.commandName,
      payload: command.payload,
      contractVersion: command.contractVersion,
      aggregateId: command.aggregateId,
      aggregateName: command.aggregateName,
      systemName: command.systemName,
      sessionId: command.sessionId,
      userId: command.userId,
      frontendName: command.frontendName,
      pushIndex: command.pushIndex,
    });
    db.insert(materializedAggregateRepoDrizzleSchemas.executionClaims)
      .values({
        aggregateIndex: command.aggregateIndex,
        commandId: command.id,
        canonicalBytes,
        chainedAt: command.chainedAt,
        command: canonicalBytes,
        claimedAt: new Date('2026-08-31T16:01:01.000Z'),
        result: null,
      })
      .run();

    const result = await Effect.runPromise(
      execute({
        command,
        db,
        key: {
          systemId: 'sys_test',
          aggregateId: command.aggregateId,
          aggregateName: command.aggregateName,
        },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe(
        'materialized-aggregate-execution-in-doubt',
      );
    }
    expect(
      db.select().from(system.aggregates.user.models.user.drizzleSchema).all(),
    ).toEqual([]);
  });

  it('retains an encoded authored failure and advances the aggregate frontier', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const command = Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
      id: 'cmd_materialized_failure',
      commandName: 'missingContract',
      payload: '{}',
      contractVersion: '1.0.0',
      aggregateId: 'acct_materialized_failure',
      aggregateName: 'user',
      systemName: 'system-worker',
      sessionId: null,
      userId: null,
      frontendName: null,
      pushIndex: null,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T16:02:00.000Z',
      delta: null,
      failedAt: null,
      failure: null,
    });

    const terminal = await Effect.runPromise(
      execute({
        command,
        db,
        key: {
          systemId: 'sys_test',
          aggregateId: command.aggregateId,
          aggregateName: command.aggregateName,
        },
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(terminal.delta).toEqual({
      inserted: [],
      updated: [],
      deleted: [],
      mutations: [],
    });
    expect(terminal.failedAt).toBeInstanceOf(Date);
    expect(terminal.failure).toMatchObject({
      code: 'aggregate-contract-not-found',
    });
    expect(typeof terminal.failure).toBe('object');
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
        .get()?.result,
    ).not.toBeNull();
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.materializationState)
        .get(),
    ).toEqual({ id: 1, aggregateIndex: 1 });
  });

  it('captures the current service resource and subscribes at its frontier before first replica commit', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const createdAt = new Date('2026-08-31T16:03:00.000Z');
    const payload = await Effect.runPromise(
      system.aggregates.user.contracts.replicateProduct.encodePayload({
        payload: {
          product: {
            id: 'prd_materialized_capture',
            modelName: 'product',
            name: 'Stale payload',
            version: '1.0.0',
            createdAt,
            updatedAt: createdAt,
          },
        },
      }),
    );
    const command = Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
      id: 'cmd_materialized_capture',
      commandName: 'replicateProduct',
      payload,
      contractVersion: '1.0.0',
      aggregateId: 'acct_materialized_capture',
      aggregateName: 'user',
      systemName: 'system-worker',
      sessionId: null,
      userId: null,
      frontendName: null,
      pushIndex: null,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T16:03:01.000Z',
      delta: null,
      failedAt: null,
      failure: null,
    });
    materializedService.getReplicatedResources.mockResolvedValue({
      _tag: 'Success',
      success: {
        resources: [
          {
            status: 'found',
            modelName: 'product',
            resourceId: 'prd_materialized_capture',
            resource: {
              id: 'prd_materialized_capture',
              modelName: 'product',
              name: 'Current service value',
              version: '1.0.0',
              createdAt,
              updatedAt: createdAt,
            },
          },
        ],
        serviceIndex: 7,
      },
    });
    aggregateHistory.subscribeService.mockImplementation(() => {
      expect(
        db
          .select()
          .from(system.aggregates.user.models.product.drizzleSchema)
          .get(),
      ).toBeUndefined();
      return Promise.resolve({ _tag: 'Success', success: undefined });
    });

    const terminal = await Effect.runPromise(
      execute({
        command,
        db,
        key: {
          systemId: 'sys_test',
          aggregateId: command.aggregateId,
          aggregateName: command.aggregateName,
        },
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(materializedService.getReplicatedResources).toHaveBeenCalledWith({
      resources: [
        {
          modelName: 'product',
          resourceId: 'prd_materialized_capture',
        },
      ],
    });
    expect(aggregateHistory.subscribeService).toHaveBeenCalledWith({
      currentServiceIndex: 7,
      serviceName: 'app',
    });
    expect(terminal.delta?.inserted).toEqual([
      expect.objectContaining({
        id: 'prd_materialized_capture',
        name: 'Current service value',
      }),
    ]);
    expect(
      db
        .select()
        .from(system.aggregates.user.models.product.drizzleSchema)
        .get(),
    ).toMatchObject({
      id: 'prd_materialized_capture',
      name: 'Current service value',
    });
  });

  it('leaves a failed replication snapshot claim in-doubt and never reruns it', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const createdAt = new Date('2026-08-31T16:05:00.000Z');
    const payload = await Effect.runPromise(
      system.aggregates.user.contracts.replicateProduct.encodePayload({
        payload: {
          product: {
            id: 'prd_materialized_snapshot_failure',
            modelName: 'product',
            name: 'Snapshot failure',
            version: '1.0.0',
            createdAt,
            updatedAt: createdAt,
          },
        },
      }),
    );
    const command = Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
      id: 'cmd_materialized_snapshot_failure',
      commandName: 'replicateProduct',
      payload,
      contractVersion: '1.0.0',
      aggregateId: 'acct_materialized_snapshot_failure',
      aggregateName: 'user',
      systemName: 'system-worker',
      sessionId: null,
      userId: null,
      frontendName: null,
      pushIndex: null,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T16:05:01.000Z',
      delta: null,
      failedAt: null,
      failure: null,
    });
    materializedService.getReplicatedResources.mockRejectedValue(
      new Error('snapshot transport unavailable'),
    );
    const key = {
      systemId: 'sys_test',
      aggregateId: command.aggregateId,
      aggregateName: command.aggregateName,
    };

    const failedSnapshot = await Effect.runPromise(
      execute({ command, db, key }).pipe(
        Effect.provide(AsyncLive),
        Effect.result,
      ),
    );
    expect(Result.isFailure(failedSnapshot)).toBe(true);
    if (Result.isFailure(failedSnapshot)) {
      expect(failedSnapshot.failure.code).toBe(
        'materialized-aggregate-replication-snapshot-rpc-failed',
      );
    }
    expect(
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
        .get()?.result,
    ).toBeNull();

    const retry = await Effect.runPromise(
      execute({ command, db, key }).pipe(
        Effect.provide(AsyncLive),
        Effect.result,
      ),
    );
    expect(Result.isFailure(retry)).toBe(true);
    if (Result.isFailure(retry)) {
      expect(retry.failure.code).toBe(
        'materialized-aggregate-execution-in-doubt',
      );
    }
    expect(materializedService.getReplicatedResources).toHaveBeenCalledTimes(1);
  });

  it('applies one exact service-derived deletion only to an existing matching replica', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedAggregateRepoDbConfig({
          models: system.aggregates.user.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const createdAt = new Date('2026-08-31T16:06:00.000Z');
    db.insert(system.aggregates.user.models.product.drizzleSchema)
      .values({
        id: 'prd_materialized_derived',
        modelName: 'product',
        name: 'Before source command',
        version: '1.0.0',
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      })
      .run();
    const command = Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
      id: 'cmd_materialized_derived',
      commandName: 'updateProduct',
      payload: '{"id":"prd_materialized_derived"}',
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 4,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T16:06:01.000Z',
      delta: null,
      failedAt: null,
      failure: null,
    });
    const source = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      id: command.id,
      commandName: command.commandName,
      payload: command.payload,
      contractVersion: command.contractVersion,
      serviceName: command.serviceName,
      serviceIndex: command.serviceIndex,
      chainedAt: command.chainedAt.toISOString(),
      delta: {
        inserted: [],
        updated: [],
        deleted: [
          {
            id: 'prd_materialized_derived',
            modelName: 'product',
            name: 'Before source command',
            version: '1.0.0',
            createdAt: '2026-08-31T16:06:00.000Z',
            updatedAt: '2026-08-31T16:06:02.000Z',
            deletedAt: '2026-08-31T16:06:02.000Z',
          },
        ],
        mutations: [],
      },
      failedAt: null,
      failure: null,
    });
    serviceHistory.getCommands.mockResolvedValue({
      _tag: 'Success',
      success: {
        commands: [source],
        tip: 4,
      },
    });

    const terminal = await Effect.runPromise(
      execute({
        command,
        db,
        key: {
          systemId: 'sys_test',
          aggregateId: 'acct_materialized_derived',
          aggregateName: 'user',
        },
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(serviceHistory.getCommands).toHaveBeenCalledWith({
      afterServiceIndex: 3,
    });
    expect(terminal.delta?.deleted).toEqual([
      expect.objectContaining({
        id: 'prd_materialized_derived',
        deletedAt: new Date('2026-08-31T16:06:02.000Z'),
      }),
    ]);
    expect(terminal.delta?.mutations).toEqual([]);
    expect(
      db
        .select()
        .from(system.aggregates.user.models.product.drizzleSchema)
        .get(),
    ).toMatchObject({
      id: 'prd_materialized_derived',
      deletedAt: new Date('2026-08-31T16:06:02.000Z'),
    });
  });
});
