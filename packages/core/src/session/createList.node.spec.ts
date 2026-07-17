import { it } from '@effect/vitest';
import { Effect, Either, Layer, Redacted } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { main, mainModels, User } from '../fixtures/system.ts';
import { PublishableKey } from '../services/PublishableKey.ts';
import { ZerospinApisUrl } from '../services/ZerospinApisUrl.ts';
import { IncrementalMonotonicFactory } from '../test-utils/IncrementalMonotonicFactory.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { decodeRpc } from '../utils/decodeRpc.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeSession } from './makeSession.ts';
import { makeUnstagedCommand } from './makeUnstagedCommand.ts';
import {
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';
import type { ISessionId } from './types.ts';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('sessionCreateList'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
  AsyncLive,
  Layer.succeed(ZerospinApisUrl, 'https://api.example.com/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
);

describe('createList', () => {
  it.layer(TestLayer)(it => {
    it.effect('create mutations and stage them', () => {
      return Effect.gen(function* () {
        const mutations = yield* main.contracts.createList.program({
          payload: {
            id: 'lst_1',
            name: 'List 1',
            userId: 'usr_1',
          },
        });

        expect(mutations).toMatchObject({
          created: {
            operationName: 'create',
          },
        });

        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({
          dbConfig,
        });
        const now = new Date('2026-01-01T00:00:00.000Z');
        db.insert(User.drizzleSchema)
          .values({
            id: 'usr_1',
            modelName: User.modelName,
            createdAt: now,
            updatedAt: now,
            version: User.version,
            actorId: 'actr_1',
            name: 'User',
          })
          .run();

        const sessionId = 'sesn_1' as ISessionId;
        const session = makeSession({
          frontend: main,
          generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
          sessionId,
        });
        session.store.setState({
          sessionId,
          accountId: 'acct_1',
          accountName: main.accountName,
          actorId: 'usr_1',
          generationId: 'gen_test',
          systemWorkerName: 'stub-deploy',
          systemVersion: '1.0.0',
          db,
          schema,
          models,
          vfsName: null,
          isInitialized: true,
          frontendIndex: null,
          lastRebasedPushedCursor: null,
        });

        const staged = yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_1',
              name: 'List 1',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();
        const optimisticRows = db
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .all();

        expect(stagedRows).toHaveLength(1);
        expect(stagedRows[0]?.id).toBe(staged.id);
        expect(listRows).toHaveLength(1);
        expect(listRows[0]).toEqual(
          expect.objectContaining({
            id: 'lst_1',
            name: 'List 1',
            userId: 'usr_1',
          }),
        );
        expect(optimisticRows).toHaveLength(1);
        expect(optimisticRows[0]?.commandId).toBe(stagedRows[0]?.id);
        const optimisticMutations = JSON.parse(
          optimisticRows[0]?.mutations ?? '[]',
        );
        expect(optimisticMutations).toHaveLength(1);
      });
    });

    it.effect(
      'rolls back the stage transaction when optimistic apply fails',
      () => {
        return Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({
            dbConfig,
          });

          const sessionId = 'sesn_1' as ISessionId;
          const session = makeSession({
            frontend: main,
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
            sessionId,
          });
          session.store.setState({
            sessionId,
            accountId: 'acct_1',
            accountName: main.accountName,
            actorId: 'usr_1',
            generationId: 'gen_test',
            systemWorkerName: 'stub-deploy',
            systemVersion: '1.0.0',
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: null,
            lastRebasedPushedCursor: null,
          });

          const maybeStaged = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'updateList',
              payload: {
                id: 'lst_missing',
                name: 'Missing',
                userId: 'usr_1',
              },
            }),
          ).pipe(
            Effect.flatMap(encoded => decodeRpc(encoded)),
            Effect.either,
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

          expect(Either.isLeft(maybeStaged)).toBe(true);
          expect(stagedRows).toHaveLength(0);
          expect(listRows).toHaveLength(0);
          expect(optimisticRows).toHaveLength(0);
        });
      },
    );

    it.effect('makeUnstagedCommand', () => {
      return Effect.gen(function* () {
        const createList1 = yield* makeUnstagedCommand({
          accountId: 'acct_1',
          actorId: 'usr_1',
          frontend: main,
          commandName: 'createList',
          payload: {
            id: 'lst_1',
            name: 'List 1',
            userId: 'usr_1',
          },
          sessionId: 'sesn_1',
          systemVersion: '1.0.0',
        });

        expect(createList1.commandName).toBe('createList');
      });
    });
  });
});
