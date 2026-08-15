import { it } from '@effect/vitest';
import { Effect, Either, Layer, Redacted } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { main, mainModels, User } from '../fixtures/system.ts';
import { PublishableKey } from '../services/PublishableKey.ts';
import { ZerospinApiUrl } from '../services/ZerospinApiUrl.ts';
import { IncrementalMonotonicFactory } from '../test-utils/IncrementalMonotonicFactory.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { decodeRpc } from '../utils/decodeRpc.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeSession } from './makeSession.ts';
import {
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';
import type { ISessionId } from './types.ts';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('sessionDeleteList'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
  AsyncLive,
  Layer.succeed(ZerospinApiUrl, 'https://api.example.com/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
);

const makeSessionDb = Effect.gen(function* () {
  const models = mainModels;
  const dbConfig = makeResourceDbConfig({
    models,
    otherTables: sessionRepoTables,
  });
  const { schema } = dbConfig;
  const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
  const now = new Date('2026-01-01T00:00:00.000Z');
  db.insert(User.drizzleSchema)
    .values({
      id: 'usr_1',
      modelName: User.modelName,
      createdAt: now,
      updatedAt: now,
      version: User.version,
      userId: 'user_1',
      name: 'User',
    })
    .run();

  const sessionId = 'sesn_1' as ISessionId;
  const session = makeSession({
    frontend: main,
    generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
    sessionId,
  });
  session.store.setState({
    sessionId,
    aggregateId: 'acct_1',
    aggregateName: main.aggregateName,
    userId: 'usr_1',
    systemId: 'sys_test',
    systemVersion: '1.0.0',
    frontendName: main.frontendName,
    aggregateFrontendLockKey: 'aggregate-lock-key',
    db,
    schema,
    models,
    vfsName: null,
    isInitialized: true,
    frontendIndex: 0,
    replicaIndex: null,
  });

  return { db, models, session };
});

describe('deleteList', () => {
  it.layer(TestLayer)(it => {
    it.effect('stages an optimistic delete with a full-row inverse', () =>
      Effect.gen(function* () {
        const { db, models, session } = yield* makeSessionDb;

        yield* decodeRpc(
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_1',
              name: 'List 1',
              userId: 'usr_1',
            },
          }),
        );

        const staged = yield* decodeRpc(
          session.stageCommand({
            contractName: 'deleteList',
            payload: {
              id: 'lst_1',
            },
          }),
        );

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();
        const optimisticRows = db
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .all();

        expect(stagedRows).toHaveLength(2);
        expect(stagedRows[1]?.id).toBe(staged.id);
        expect(listRows).toHaveLength(0);
        expect(optimisticRows).toHaveLength(2);
        const deleteMutations = JSON.parse(
          optimisticRows[1]?.mutations ?? '[]',
        ) as Array<{
          operationName: string;
          inverseOperation: string;
        }>;
        expect(deleteMutations).toHaveLength(1);
        expect(deleteMutations[0]?.operationName).toBe('delete');
        expect(
          JSON.parse(deleteMutations[0]?.inverseOperation ?? 'null'),
        ).toMatchObject({
          resource: {
            id: 'lst_1',
            name: 'List 1',
          },
        });
      }),
    );

    it.effect('rolls back the stage transaction for a missing row', () =>
      Effect.gen(function* () {
        const { db, models, session } = yield* makeSessionDb;

        const maybeStaged = yield* decodeRpc(
          session.stageCommand({
            contractName: 'deleteList',
            payload: {
              id: 'lst_missing',
            },
          }),
        ).pipe(Effect.either);

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();
        const optimisticRows = db
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .all();

        expect(Either.isLeft(maybeStaged)).toBe(true);
        expect(stagedRows).toHaveLength(0);
        expect(listRows).toHaveLength(0);
        expect(optimisticRows).toHaveLength(0);
      }),
    );
  });
});
