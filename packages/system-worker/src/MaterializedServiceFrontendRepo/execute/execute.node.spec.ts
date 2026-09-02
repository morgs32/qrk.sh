import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import { ZerospinError } from '@zerospin/error';
import { Effect, Result, Schema, Semaphore } from 'effect';
import { system } from 'system';
import { describe, expect, it, vi } from 'vitest';

import { catchup } from '../catchup/catchup.js';
import {
  makeMaterializedServiceFrontendRepoDbConfig,
  materializedServiceFrontendRepoDrizzleSchemas,
} from '../MaterializedServiceFrontendRepoDbConfig.js';

import { execute } from './execute.js';

const serviceHistory = vi.hoisted(() => ({ getCommands: vi.fn() }));

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

describe('MaterializedServiceFrontendRepo.execute', () => {
  it('advances every serviceIndex and allocates sparse serviceFrontendIndex values', async () => {
    const dbConfig = await Effect.runPromise(
      makeMaterializedServiceFrontendRepoDbConfig({
        serviceModels: system.services.app.models,
        frontendModels:
          system.services.app.frontends.products.controller.models,
      }),
    );
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    let alarmCount = 0;
    const relevant = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      id: 'cmd_service_frontend_relevant',
      commandName: 'createProduct',
      payload: '{"id":"prd_service_frontend","name":"Projected"}',
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 1,
      chainedAt: '2026-08-31T15:00:00.000Z',
      delta: {
        inserted: [
          {
            id: 'prd_service_frontend',
            modelName: 'product',
            name: 'Projected',
            version: '1.0.0',
            createdAt: '2026-08-31T15:00:00.000Z',
            updatedAt: '2026-08-31T15:00:00.000Z',
          },
        ],
        updated: [],
        deleted: [],
        mutations: [],
      },
      failedAt: null,
      failure: null,
    });
    const key = {
      systemId: 'sys_test',
      serviceName: 'app',
      userId: 'user_test',
      frontendName: 'products',
    };
    const storage = {
      setAlarm: () => {
        alarmCount += 1;
        return Promise.resolve();
      },
    };
    await Effect.runPromise(
      execute({
        command: relevant,
        db,
        key,
        serviceFrontendRepoSchema: dbConfig.schema,
        storage,
      }).pipe(Effect.provide(AsyncLive)),
    );
    await Effect.runPromise(
      execute({
        command: relevant,
        db,
        key,
        serviceFrontendRepoSchema: dbConfig.schema,
        storage,
      }).pipe(Effect.provide(AsyncLive)),
    );

    const irrelevant = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      id: 'cmd_service_frontend_irrelevant',
      commandName: 'createProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 2,
      chainedAt: '2026-08-31T15:00:01.000Z',
      delta: { inserted: [], updated: [], deleted: [], mutations: [] },
      failedAt: '2026-08-31T15:00:02.000Z',
      failure: Schema.encodeSync(ZerospinError.schema)(
        new ZerospinError({
          code: 'fixture-service-command-failed',
          message: 'Fixture failure',
        }),
      ),
    });
    await Effect.runPromise(
      execute({
        command: irrelevant,
        db,
        key,
        serviceFrontendRepoSchema: dbConfig.schema,
        storage,
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(
      db
        .select()
        .from(
          materializedServiceFrontendRepoDrizzleSchemas.materializationState,
        )
        .get(),
    ).toMatchObject({ serviceIndex: 2, serviceFrontendIndex: 1 });
    const outbox = db
      .select()
      .from(
        materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
      )
      .all();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      serviceIndex: 1,
      serviceFrontendIndex: 1,
      commandId: relevant.id,
    });
    const terminal = Schema.decodeUnknownSync(
      Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
    )(outbox[0]?.command);
    expect(terminal.failure).toBeNull();
    expect(terminal.delta?.inserted).toHaveLength(1);
    expect(
      db
        .select()
        .from(materializedServiceFrontendRepoDrizzleSchemas.executionClaims)
        .all(),
    ).toHaveLength(2);
    expect(alarmCount).toBe(1);
  });

  it('halts an in-doubt claim and serializes an exact duplicate race', async () => {
    const dbConfig = await Effect.runPromise(
      makeMaterializedServiceFrontendRepoDbConfig({
        serviceModels: system.services.app.models,
        frontendModels:
          system.services.app.frontends.products.controller.models,
      }),
    );
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    const command = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      id: 'cmd_service_frontend_race',
      commandName: 'createProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 1,
      chainedAt: '2026-08-31T15:01:00.000Z',
      delta: { inserted: [], updated: [], deleted: [], mutations: [] },
      failedAt: '2026-08-31T15:01:01.000Z',
      failure: Schema.encodeSync(ZerospinError.schema)(
        new ZerospinError({
          code: 'fixture-service-command-failed',
          message: 'Fixture failure',
        }),
      ),
    });
    const key = {
      systemId: 'sys_test',
      serviceName: 'app',
      userId: 'user_test',
      frontendName: 'products',
    };
    const semaphore = Effect.runSync(Semaphore.make(1));
    const execution = semaphore.withPermits(1)(
      execute({
        command,
        db,
        key,
        serviceFrontendRepoSchema: dbConfig.schema,
        storage: { setAlarm: () => Promise.resolve() },
      }),
    );
    await Promise.all([
      Effect.runPromise(execution.pipe(Effect.provide(AsyncLive))),
      Effect.runPromise(execution.pipe(Effect.provide(AsyncLive))),
    ]);
    expect(
      db
        .select()
        .from(materializedServiceFrontendRepoDrizzleSchemas.executionClaims)
        .all(),
    ).toHaveLength(1);

    const inDoubtDb = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    const canonicalBytes = Schema.encodeSync(
      Schema.fromJsonString(ServiceChainedCommandSchema),
    )(command);
    inDoubtDb
      .insert(materializedServiceFrontendRepoDrizzleSchemas.executionClaims)
      .values({
        serviceIndex: command.serviceIndex,
        commandId: command.id,
        canonicalBytes,
        command: canonicalBytes,
        claimedAt: new Date(),
        completedAt: null,
        result: null,
      })
      .run();
    const inDoubt = await Effect.runPromise(
      execute({
        command,
        db: inDoubtDb,
        key,
        serviceFrontendRepoSchema: dbConfig.schema,
        storage: { setAlarm: () => Promise.resolve() },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(inDoubt)).toBe(true);
    if (Result.isFailure(inDoubt)) {
      expect(inDoubt.failure.code).toBe(
        'materialized-service-frontend-execution-in-doubt',
      );
    }
  });

  it('pulls terminal history across the 64-command page boundary', async () => {
    const dbConfig = await Effect.runPromise(
      makeMaterializedServiceFrontendRepoDbConfig({
        serviceModels: system.services.app.models,
        frontendModels:
          system.services.app.frontends.products.controller.models,
      }),
    );
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    const commands: Schema.Schema.Type<typeof ServiceChainedCommandSchema>[] =
      [];
    for (let serviceIndex = 1; serviceIndex <= 65; serviceIndex += 1) {
      commands.push(
        Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
          id: `cmd_service_frontend_page_${serviceIndex}`,
          commandName: 'createProduct',
          payload: '{}',
          contractVersion: '1.0.0',
          serviceName: 'app',
          serviceIndex,
          chainedAt: new Date(serviceIndex * 1_000).toISOString(),
          delta: { inserted: [], updated: [], deleted: [], mutations: [] },
          failedAt: new Date(serviceIndex * 1_000 + 1).toISOString(),
          failure: Schema.encodeSync(ZerospinError.schema)(
            new ZerospinError({
              code: 'fixture-service-command-failed',
              message: 'Fixture failure',
            }),
          ),
        }),
      );
    }
    serviceHistory.getCommands.mockImplementation(
      ({ afterServiceIndex }: { afterServiceIndex: number | null }) => {
        const offset = afterServiceIndex ?? 0;
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
          serviceName: 'app',
          userId: 'user_test',
          frontendName: 'products',
        },
        serviceFrontendRepoSchema: dbConfig.schema,
        storage: { setAlarm: () => Promise.resolve() },
        throughServiceIndex: undefined,
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(serviceHistory.getCommands).toHaveBeenCalledTimes(2);
    expect(
      db
        .select()
        .from(
          materializedServiceFrontendRepoDrizzleSchemas.materializationState,
        )
        .get(),
    ).toMatchObject({ serviceIndex: 65, serviceFrontendIndex: 0 });
  });
});
