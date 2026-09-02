import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';
import { describe, expect, it } from 'vitest';

import {
  makeMaterializedServiceRepoDbConfig,
  materializedServiceRepoDrizzleSchemas,
} from '../MaterializedServiceRepoDbConfig.js';

import { execute } from './execute.js';

describe('MaterializedServiceRepo.execute', () => {
  it('claims once and returns the exact retained terminal occurrence', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedServiceRepoDbConfig({
          models: system.services.app.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const payload = await Effect.runPromise(
      system.services.app.contracts.createProduct.encodePayload({
        payload: { id: 'prd_execute_once', name: 'One' },
      }),
    );
    const command = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      id: 'cmd_execute_once',
      commandName: 'createProduct',
      payload,
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 1,
      chainedAt: '2026-08-31T12:00:00.000Z',
      delta: null,
      failedAt: null,
      failure: null,
    });

    const terminal = await Effect.runPromise(
      execute({
        command,
        db,
        serviceName: 'app',
        systemId: 'sys_test',
      }).pipe(Effect.provide(AsyncLive)),
    );
    const duplicate = await Effect.runPromise(
      execute({
        command,
        db,
        serviceName: 'app',
        systemId: 'sys_test',
      }).pipe(Effect.provide(AsyncLive)),
    );

    expect(terminal.delta?.inserted).toHaveLength(1);
    expect(terminal.delta?.mutations).toHaveLength(1);
    expect(duplicate).toEqual(terminal);
    expect(
      db
        .select()
        .from(materializedServiceRepoDrizzleSchemas.executionClaims)
        .all(),
    ).toHaveLength(1);
  });

  it('halts an exact retry when a durable claim has no result', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeMaterializedServiceRepoDbConfig({
          models: system.services.app.models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const payload = await Effect.runPromise(
      system.services.app.contracts.createProduct.encodePayload({
        payload: { id: 'prd_in_doubt', name: 'In doubt' },
      }),
    );
    const command = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      id: 'cmd_in_doubt',
      commandName: 'createProduct',
      payload,
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 1,
      chainedAt: '2026-08-31T12:00:00.000Z',
      delta: null,
      failedAt: null,
      failure: null,
    });
    db.insert(materializedServiceRepoDrizzleSchemas.executionClaims)
      .values({
        serviceIndex: 1,
        commandId: command.id,
        canonicalBytes: JSON.stringify({
          id: command.id,
          commandName: command.commandName,
          payload: command.payload,
          contractVersion: command.contractVersion,
          serviceName: command.serviceName,
        }),
        chainedAt: command.chainedAt,
        command: JSON.stringify({
          id: command.id,
          commandName: command.commandName,
          payload: command.payload,
          contractVersion: command.contractVersion,
          serviceName: command.serviceName,
        }),
        claimedAt: new Date('2026-08-31T12:00:01.000Z'),
        result: null,
      })
      .run();

    const result = await Effect.runPromise(
      execute({
        command,
        db,
        serviceName: 'app',
        systemId: 'sys_test',
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe(
        'materialized-service-execution-in-doubt',
      );
    }
  });
});
