import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';
import { describe, expect, it } from 'vitest';

import {
  makeMaterializedServiceFrontendRepoDbConfig,
  materializedServiceFrontendRepoDrizzleSchemas,
} from '../MaterializedServiceFrontendRepoDbConfig.js';

import { publishFinalizedCommands } from './publishFinalizedCommands.js';

describe('MaterializedServiceFrontendRepo.publishFinalizedCommands', () => {
  it('retains a failed publication and publishes the exact outbox command on retry', async () => {
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
    const command = Schema.decodeUnknownSync(
      ServiceFrontendFinalizedCommandSchema,
    )({
      id: 'cmd_service_frontend_publish',
      commandName: 'createProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 1,
      serviceFrontendIndex: 1,
      chainedAt: '2026-08-31T15:02:00.000Z',
      delta: { inserted: [], updated: [], deleted: [], mutations: [] },
      failedAt: null,
      failure: null,
    });
    const canonicalBytes = Schema.encodeSync(
      Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
    )(command);
    db.insert(
      materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
    )
      .values({
        serviceFrontendIndex: 1,
        serviceIndex: 1,
        commandId: command.id,
        canonicalBytes,
        command: canonicalBytes,
        publishedAt: null,
        failure: null,
      })
      .run();
    let shouldFail = true;
    let attempts = 0;
    const finalizedCommandChain = {
      publishCommand: (props: { command: typeof command }) => {
        attempts += 1;
        expect(props.command).toEqual(command);
        return Promise.resolve(
          shouldFail
            ? {
                _tag: 'Failure',
                failure: Schema.encodeSync(ZerospinError.schema)(
                  new ZerospinError({
                    code: 'fixture-publish-failed',
                    message: 'Fixture publication failure',
                  }),
                ),
              }
            : { _tag: 'Success', success: undefined },
        );
      },
    };

    await Effect.runPromise(
      publishFinalizedCommands({ db, finalizedCommandChain }).pipe(
        Effect.provide(AsyncLive),
        Effect.ignore,
      ),
    );
    expect(attempts).toBe(3);
    expect(
      db
        .select()
        .from(
          materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
        )
        .get(),
    ).toMatchObject({ publishedAt: null });
    expect(
      db
        .select()
        .from(
          materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
        )
        .get()?.failure,
    ).toContain('fixture-publish-failed');

    shouldFail = false;
    await Effect.runPromise(
      publishFinalizedCommands({ db, finalizedCommandChain }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    expect(attempts).toBe(4);
    expect(
      db
        .select()
        .from(
          materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
        )
        .get(),
    ).toMatchObject({ failure: null });
    expect(
      db
        .select()
        .from(
          materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
        )
        .get()?.publishedAt,
    ).toBeInstanceOf(Date);
  });
});
