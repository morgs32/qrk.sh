/*
 * System-worker annotation:
 * Exercises the Authorization Repo.workerd.spec behavior through the local test/runtime harness.
 * The assertions document expected integration behavior; avoid broad rewrites while changing production code.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { main } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { AuthorizationRepo } from './AuthorizationRepo.js';
import { getAuthorizationRepo } from './getAuthorizationRepo/getAuthorizationRepo.js';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('AuthorizationRepo'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('AuthorizationRepo', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'records authorization attempts and authorized actor frontends',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: 'authorization-repo' });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({ abbreviation: 'usr' });

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAuthorizationRepo,
              repo: AuthorizationRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => {
                const now = new Date(0);
                db.insert(schema.user)
                  .values({
                    id: userId,
                    actorId,
                    modelName: 'user',
                    name: 'Authorization spec user',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
              },
            }),
          );

          const authorizationRepo = yield* getAuthorizationRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });

          yield* makeAsync(() =>
            authorizationRepo.authorize({
              actor: { actorId, accountId },
              accountName: main.accountName,
              actorName: main.actorName,
              frontendName: main.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const authorized = yield* makeAsync(() =>
            authorizationRepo.getAuthorizedActorFrontends({
              accountName: main.accountName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(
            authorized.some(
              row =>
                row.actorId === actorId &&
                row.actorName === main.actorName &&
                row.frontendName === main.frontendName,
            ),
          ).toBe(true);
        }).pipe(Effect.provide(AsyncLive)),
    );
  });
});
