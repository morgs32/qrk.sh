/*
 * Persisted FrontendRepo migration acceptance:
 *
 * 1. Recreate an initialized projection without terminal tables or lineage defaults.
 * 2. Re-enter through the ordinary Durable Object constructor.
 * 3. Prove existing projection rows survive and current terminal reads work.
 * 4. Prove either independently durable default write can resume after a crash.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { abortAllDurableObjects } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { FrontendRepo } from './FrontendRepo.js';
import { getFrontendRepo } from './getFrontendRepo/getFrontendRepo.js';

describe('FrontendRepo persisted migrations', () => {
  it.effect(
    'adds terminal tables and legacy projection defaults without replacing existing rows',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_frontend_repo_raw_migration',
          accountId: 'acct_frontend_repo_raw_migration',
          accountName: 'user',
          actorName: 'main',
          actorId: 'actr_frontend_repo_raw_migration',
          frontendName: 'main',
        };

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getFrontendRepo,
            repo: FrontendRepo,
            key,
            fn: ({ db, schema, storage }) => {
              db.insert(schema.graph)
                .values({
                  resourceId: 'lst_frontend_repo_raw_migration',
                  modelName: 'list',
                })
                .run();
              storage.sql.exec(
                `INSERT INTO pushedCommands (
                  id,
                  commandName,
                  payload,
                  systemName,
                  systemVersion,
                  version,
                  commandType,
                  accountId,
                  accountName,
                  frontendName,
                  actorId,
                  actorName,
                  sessionId,
                  stagedCursor,
                  stagedAt,
                  status,
                  pushedAt,
                  pushedCursor
                ) VALUES (?, ?, ?, ?, ?, ?, 'frontend', ?, ?, ?, ?, ?, ?, ?, ?, 'pushed', ?, ?)`,
                'cmd_frontend_repo_raw_migration',
                'createList',
                '{"id":"lst_frontend_repo_raw_migration"}',
                'system-worker',
                '1.0.1',
                '1.0.0',
                key.accountId,
                key.accountName,
                key.frontendName,
                key.actorId,
                key.actorName,
                'sesn_frontend_repo_raw_migration',
                'stcur_frontend_repo_raw_migration_1',
                1,
                2,
                'pcur_frontend_repo_raw_migration_1',
              );
              storage.kv.put('initialized', true);
              storage.kv.put('frontendIndex', 6);
              storage.kv.put(
                'systemWorkerName',
                'system-worker-frontend-raw-migration',
              );
              storage.kv.delete('emissionMode');
              storage.kv.delete('segmentKind');
              storage.sql.exec('DROP TABLE executedPushedCommands');
              storage.sql.exec('DROP TABLE failedPushedCommands');
            },
          }),
        );

        yield* Effect.promise(() => abortAllDurableObjects());
        const frontendRepo = yield* getFrontendRepo({ key });
        const readiness = yield* makeAsync(() =>
          frontendRepo.getProjectionReadiness(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(readiness).toEqual({
          generationId: key.generationId,
          systemWorkerName: 'system-worker-frontend-raw-migration',
          lastAccountCursor: null,
          accountIndex: null,
          frontendIndex: 6,
        });

        const migratedProjection = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getFrontendRepo,
            repo: FrontendRepo,
            key,
            fn: ({ db, schema, storage }) => ({
              graphRows: db.select().from(schema.graph).all(),
              pushedRows: db.select().from(schema.pushedCommands).all(),
              executedRows: db
                .select()
                .from(schema.executedPushedCommands)
                .all(),
              failedRows: db
                .select()
                .from(schema.failedPushedCommands)
                .all(),
              emissionMode: storage.kv.get('emissionMode'),
              segmentKind: storage.kv.get('segmentKind'),
            }),
          }),
        );
        expect(migratedProjection).toEqual({
          graphRows: [
            {
              resourceId: 'lst_frontend_repo_raw_migration',
              modelName: 'list',
            },
          ],
          pushedRows: [
            {
              id: 'cmd_frontend_repo_raw_migration',
              commandName: 'createList',
              payload: '{"id":"lst_frontend_repo_raw_migration"}',
              systemName: 'system-worker',
              systemVersion: '1.0.1',
              version: '1.0.0',
              commandType: 'frontend',
              accountId: key.accountId,
              accountName: key.accountName,
              frontendName: key.frontendName,
              actorId: key.actorId,
              actorName: key.actorName,
              sessionId: 'sesn_frontend_repo_raw_migration',
              stagedCursor: 'stcur_frontend_repo_raw_migration_1',
              stagedAt: new Date(1_000),
              status: 'pushed',
              pushedAt: new Date(2_000),
              pushedCursor: 'pcur_frontend_repo_raw_migration_1',
            },
          ],
          executedRows: [],
          failedRows: [],
          emissionMode: 'live',
          segmentKind: 'root',
        });

        // A second cold start must preserve the same projection and must not
        // recreate, clear, or otherwise mutate either terminal table.
        yield* Effect.promise(() => abortAllDurableObjects());
        const restartedFrontendRepo = yield* getFrontendRepo({ key });
        const secondReadiness = yield* makeAsync(() =>
          restartedFrontendRepo.getProjectionReadiness(),
        ).pipe(Effect.flatMap(decodeRpc));
        const secondProjection = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getFrontendRepo,
            repo: FrontendRepo,
            key,
            fn: ({ db, schema, storage }) => ({
              graphRows: db.select().from(schema.graph).all(),
              pushedRows: db.select().from(schema.pushedCommands).all(),
              executedRows: db
                .select()
                .from(schema.executedPushedCommands)
                .all(),
              failedRows: db
                .select()
                .from(schema.failedPushedCommands)
                .all(),
              emissionMode: storage.kv.get('emissionMode'),
              segmentKind: storage.kv.get('segmentKind'),
            }),
          }),
        );
        expect(secondReadiness).toEqual(readiness);
        expect(secondProjection).toEqual(migratedProjection);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'resumes after the terminal-table and default writes were only partially persisted',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_frontend_repo_interrupted_migration',
          accountId: 'acct_frontend_repo_interrupted_migration',
          accountName: 'user',
          actorName: 'main',
          actorId: 'actr_frontend_repo_interrupted_migration',
          frontendName: 'main',
        };

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getFrontendRepo,
            repo: FrontendRepo,
            key,
            fn: ({ db, schema, storage }) => {
              db.insert(schema.graph)
                .values({
                  resourceId: 'lst_frontend_repo_interrupted_migration',
                  modelName: 'list',
                })
                .run();
              storage.kv.put('initialized', true);
              storage.kv.put('frontendIndex', 11);
              storage.kv.put(
                'systemWorkerName',
                'system-worker-frontend-interrupted-migration',
              );

              // The first default and first terminal table survived, while
              // the second durable write in each pair did not.
              storage.kv.put('emissionMode', 'live');
              storage.kv.delete('segmentKind');
              storage.sql.exec('DROP TABLE failedPushedCommands');
            },
          }),
        );

        yield* Effect.promise(() => abortAllDurableObjects());
        const frontendRepo = yield* getFrontendRepo({ key });
        const readiness = yield* makeAsync(() =>
          frontendRepo.getProjectionReadiness(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(readiness).toEqual({
          generationId: key.generationId,
          systemWorkerName: 'system-worker-frontend-interrupted-migration',
          lastAccountCursor: null,
          accountIndex: null,
          frontendIndex: 11,
        });

        const resumedProjection = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getFrontendRepo,
            repo: FrontendRepo,
            key,
            fn: ({ db, schema, storage }) => ({
              graphRows: db.select().from(schema.graph).all(),
              executedRows: db
                .select()
                .from(schema.executedPushedCommands)
                .all(),
              failedRows: db
                .select()
                .from(schema.failedPushedCommands)
                .all(),
              emissionMode: storage.kv.get('emissionMode'),
              segmentKind: storage.kv.get('segmentKind'),
            }),
          }),
        );
        expect(resumedProjection).toEqual({
          graphRows: [
            {
              resourceId: 'lst_frontend_repo_interrupted_migration',
              modelName: 'list',
            },
          ],
          executedRows: [],
          failedRows: [],
          emissionMode: 'live',
          segmentKind: 'root',
        });

        yield* Effect.promise(() => abortAllDurableObjects());
        const secondResumedProjection = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getFrontendRepo,
            repo: FrontendRepo,
            key,
            fn: ({ db, schema, storage }) => ({
              graphRows: db.select().from(schema.graph).all(),
              executedRows: db
                .select()
                .from(schema.executedPushedCommands)
                .all(),
              failedRows: db
                .select()
                .from(schema.failedPushedCommands)
                .all(),
              emissionMode: storage.kv.get('emissionMode'),
              segmentKind: storage.kv.get('segmentKind'),
            }),
          }),
        );
        expect(secondResumedProjection).toEqual(resumedProjection);
      }).pipe(Effect.provide(AsyncLive)),
  );
});
