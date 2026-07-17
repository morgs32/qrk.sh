import { it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { List, main, mainModels } from '../fixtures/system.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { applyFrontendReplicaState } from './applyFrontendReplicaState.ts';
import { sessionStagedCommandDrizzleSchema } from './sessionCommandShape.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('applyFrontendReplicaState'),
  ErrorLayer,
  TestContext,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyFrontendReplicaState', () => {
  it.layer(TestLayer)(it => {
    it.effect('applies frontend state and then restores staged commands', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

        const stagedCommand = {
          id: 'cmd_1',
          commandName: 'createList',
          payload: JSON.stringify({
            id: 'lst_2',
            name: 'Staged',
            userId: 'usr_1',
          }),
          systemName: main.systemName,
          systemVersion: '1.0.0',
          version: '1.0.0',
          commandType: 'frontend',
          accountId: 'acct_1',
          accountName: main.accountName,
          frontendName: main.frontendName,
          actorId: 'usr_1',
          actorName: main.actorName,
          sessionId: 'sesn_1',
          status: 'staged',
          stagedCursor: 'stcur_1',
          stagedAt: now,
          pushedCursor: null,
        };

        yield* applyFrontendReplicaState({
          frontend: main,
          db,
          schema,
          models,
          frontendReplicaState: {
            actorId: 'usr_1',
            accountName: main.accountName,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemWorkerName: 'stub-deploy',
            frontendIndex: null,
            lastRebasedPushedCursor: null,
            pushedCommands: [],
            resources: [
              {
                id: 'lst_1',
                modelName: List.modelName,
                createdAt: now,
                updatedAt: now,
                version: List.version,
                name: 'Restored',
                userId: 'usr_1',
              },
            ],
            stagedCommands: [stagedCommand],
            executedPushedCommands: [],
            failedPushedCommands: [],
          },
        });

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();

        expect(listRows).toHaveLength(1);
        expect(listRows[0]?.id).toBe('lst_1');
        expect(stagedRows).toHaveLength(1);
        expect(stagedRows[0]).toEqual(stagedCommand);
      }),
    );
  });
});
