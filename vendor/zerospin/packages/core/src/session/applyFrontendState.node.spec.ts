import { it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { encodeCommand } from '../contracts/encodeCommand.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { List, main, mainModels, User } from '../fixtures/system.ts';
import type {
  IEncodedResourceShape,
  InferEncodedRow,
} from '../models/types.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { applyFrontendState } from './applyFrontendState.ts';
import { makeUnstagedCommand } from './makeUnstagedCommand.ts';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionExecutedPushedCommandShape,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionRepoTables } from './sessionRepoTables.ts';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('applyFrontendState'),
  ErrorLayer,
  TestContext,
);

const now = new Date('2026-01-01T00:00:00.000Z');

describe('applyFrontendState', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'resets and seeds resources and command statuses while preserving historical command provenance',
      () =>
        Effect.gen(function* () {
          const models = mainModels;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

          const contract = yield* getByKeyOrThrow({
            record: main.contracts,
            key: 'createList',
            recordKind: 'contracts',
          });

          const pushedBase = yield* makeUnstagedCommand({
            accountId: 'acct_1',
            actorId: 'actr_1',
            frontend: main,
            commandName: 'createList',
            payload: {
              id: 'lst_1',
              name: 'List',
              userId: 'usr_1',
            },
            sessionId: 'sesn_1',
            systemVersion: '1.0.0',
          });

          const pushedCommand = yield* encodeCommand({
            contract,
            command: {
              ...pushedBase,
              stagedCursor: 'stcur_state',
              stagedAt: now,
              pushedAt: now,
              pushedCursor: 'pcur_state' as const,
              status: 'pushed' as const,
            },
          });

          const executedPushedCommand: InferEncodedRow<
            typeof sessionExecutedPushedCommandShape
          > = {
            id: 'cmd_finalized',
            commandName: pushedCommand.commandName,
            payload: pushedCommand.payload,
            systemName: pushedCommand.systemName,
            systemVersion: pushedCommand.systemVersion,
            version: pushedCommand.version,
            commandType: 'frontend',
            accountId: pushedCommand.accountId,
            accountName: pushedCommand.accountName,
            actorId: pushedCommand.actorId,
            actorName: pushedCommand.actorName,
            sessionId: pushedCommand.sessionId,
            frontendName: pushedCommand.frontendName,
            stagedCursor: pushedCommand.stagedCursor,
            stagedAt: pushedCommand.stagedAt,
            pushedAt: pushedCommand.pushedAt,
            pushedCursor: pushedCommand.pushedCursor,
            mode: 'authoritative',
            accountCursor: 'acur_state',
            accountIndex: 1,
            executedAt: now,
            status: 'executed',
          };
          const failedPushedCommand = {
            ...pushedCommand,
            id: 'cmd_failed',
            accountCursor: 'acur_failed',
            accountIndex: 2,
            failedAt: now,
            failure: 'Rejected',
            status: 'failed',
          };

          db.insert(sessionStagedCommandDrizzleSchema)
            .values({
              id: 'cmd_staged',
              commandName: pushedCommand.commandName,
              payload: pushedCommand.payload,
              systemName: pushedCommand.systemName,
              systemVersion: '0.9.0',
              version: pushedCommand.version,
              commandType: 'frontend',
              accountId: pushedCommand.accountId,
              accountName: pushedCommand.accountName,
              frontendName: pushedCommand.frontendName,
              actorId: pushedCommand.actorId,
              actorName: pushedCommand.actorName,
              sessionId: pushedCommand.sessionId,
              status: 'staged',
              stagedCursor: 'stcur_local',
              stagedAt: now,
              pushedCursor: null,
            })
            .run();

          yield* applyFrontendState({
            frontend: main,
            frontendVersion: main.version,
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '2.0.0',
            systemWorkerName: 'stub-deploy',
            db,
            schema,
            models,
            frontendState: {
              accountId: 'acct_1',
              actorId: 'actr_1',
              systemId: 'sys_1',
              generationId: 'gen_1',
              systemVersion: '2.0.0',
              accountName: main.accountName,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'stub-deploy',
              frontendIndex: 0,
              lastRebasedPushedCursor: pushedCommand.pushedCursor,
              pushedCommands: [pushedCommand],
              resources: [
                {
                  id: 'usr_1',
                  modelName: User.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: User.version,
                  actorId: 'actr_1',
                  name: 'User',
                },
                {
                  id: 'lst_1',
                  modelName: List.modelName,
                  createdAt: now,
                  updatedAt: now,
                  version: List.version,
                  name: 'List',
                  userId: 'usr_1',
                },
              ],
              executedPushedCommands: [executedPushedCommand],
              failedPushedCommands: [failedPushedCommand],
            },
          });

          const pushedRows = db
            .select()
            .from(sessionPushedCommandDrizzleSchema)
            .all();
          const executedRows = db
            .select()
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .all();
          const optimisticRows = db
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .all();
          const failedRows = db
            .select()
            .from(sessionFailedCommandDrizzleSchema)
            .all();
          const stagedRows = db
            .select()
            .from(sessionStagedCommandDrizzleSchema)
            .all();

          expect(pushedRows).toHaveLength(1);
          expect(pushedRows[0]?.id).toBe(pushedCommand.id);
          expect(pushedRows[0]?.pushedCursor).toBe(pushedCommand.pushedCursor);
          expect(executedRows).toHaveLength(1);
          expect(optimisticRows).toHaveLength(0);
          expect(executedRows[0]?.id).toBe(executedPushedCommand.id);
          expect(failedRows).toEqual([failedPushedCommand]);
          expect(stagedRows).toEqual([
            expect.objectContaining({
              id: 'cmd_staged',
              systemVersion: '0.9.0',
            }),
          ]);
          expect(
            [...pushedRows, ...executedRows].every(
              row => !('encodedOperations' in row),
            ),
          ).toBe(true);
        }),
    );

    it.effect('inserts resources from frontend state resource arrays', () =>
      Effect.gen(function* () {
        const models = mainModels;
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoTables,
        });
        const { schema } = dbConfig;
        const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
        const resources: IEncodedResourceShape[] = [
          {
            id: 'usr_1',
            modelName: User.modelName,
            createdAt: now,
            updatedAt: now,
            version: User.version,
            actorId: 'actr_1',
            name: 'User',
          },
        ];

        for (let index = 0; index < 105; index += 1) {
          resources.push({
            id: `lst_batch_${index}`,
            modelName: List.modelName,
            createdAt: now,
            updatedAt: now,
            version: List.version,
            name: `List ${index}`,
            userId: 'usr_1',
          });
        }
        yield* applyFrontendState({
          frontend: main,
          frontendVersion: main.version,
          accountId: 'acct_1',
          actorId: 'actr_1',
          systemId: 'sys_1',
          generationId: 'gen_1',
          systemVersion: '1.0.0',
          systemWorkerName: 'stub-deploy',
          db,
          schema,
          models,
          frontendState: {
            accountId: 'acct_1',
            actorId: 'actr_1',
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            accountName: main.accountName,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemWorkerName: 'stub-deploy',
            frontendIndex: 0,
            lastRebasedPushedCursor: null,
            pushedCommands: [],
            resources,
            executedPushedCommands: [],
            failedPushedCommands: [],
          },
        });

        const rows = db.select().from(models.list.drizzleSchema).all();

        expect(rows).toHaveLength(105);
      }),
    );
  });
});
