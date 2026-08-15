/* AggregateFrontendRepo persisted command-schema hard-cutover coverage. */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { abortAllDurableObjects } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { AggregateFrontendRepo } from './AggregateFrontendRepo.js';
import { getAggregateFrontendRepo } from './getAggregateFrontendRepo/getAggregateFrontendRepo.js';

describe('AggregateFrontendRepo persisted command schema', () => {
  it.effect(
    'rejects legacy pushed-block session ownership before mutating it',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_frontend_repo_legacy_command_schema',
          aggregateId: 'acct_frontend_repo_legacy_command_schema',
          aggregateName: 'user',
          userId: 'user_frontend_repo_legacy_command_schema',
          frontendName: 'main',
        };
        const inspected = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendRepo,
            repo: AggregateFrontendRepo,
            key,
            fn: async ({ key: repoKey, name, state }) => {
              state.storage.sql.exec(
                'CREATE TABLE pushedBlockOutbox (id TEXT PRIMARY KEY NOT NULL, firstPushedCursor TEXT NOT NULL, block TEXT NOT NULL, finalizedAt INTEGER, failure TEXT, sessionId TEXT)',
              );
              state.storage.sql.exec(
                'INSERT INTO pushedBlockOutbox (id, firstPushedCursor, block, finalizedAt, failure, sessionId) VALUES (?, ?, ?, NULL, NULL, ?)',
                'pblk_frontend_repo_legacy_command_schema',
                'pcur_frontend_repo_legacy_command_schema',
                JSON.stringify({
                  id: 'pblk_frontend_repo_legacy_command_schema',
                  sessionId: 'sesn_frontend_repo_legacy_command_schema',
                  admissionLastAggregateCursor: null,
                  commands: [],
                }),
                'sesn_frontend_repo_legacy_command_schema',
              );
              state.storage.kv.delete('aggregateFrontendCommandSchemaReceipt');
              const before = {
                columns: [
                  ...state.storage.sql.exec<{ name: string }>(
                    'PRAGMA table_info(pushedBlockOutbox)',
                  ),
                ].map(column => column.name),
                rows: [
                  ...state.storage.sql.exec(
                    'SELECT id, firstPushedCursor, block, sessionId FROM pushedBlockOutbox',
                  ),
                ],
                receipt: state.storage.kv.get(
                  'aggregateFrontendCommandSchemaReceipt',
                ),
              };
              let failure = '';
              try {
                await managedRuntime.runPromise(
                  AggregateFrontendRepo.boundDORepoConfig
                    .getDbConfig({
                      key: repoKey,
                      name,
                      storage: state.storage,
                    })
                    .pipe(Effect.provide(AsyncLive)),
                );
              } catch (cause) {
                failure =
                  cause instanceof Error ? cause.message : String(cause);
              }
              return {
                before,
                after: {
                  columns: [
                    ...state.storage.sql.exec<{ name: string }>(
                      'PRAGMA table_info(pushedBlockOutbox)',
                    ),
                  ].map(column => column.name),
                  rows: [
                    ...state.storage.sql.exec(
                      'SELECT id, firstPushedCursor, block, sessionId FROM pushedBlockOutbox',
                    ),
                  ],
                  receipt: state.storage.kv.get(
                    'aggregateFrontendCommandSchemaReceipt',
                  ),
                },
                failure,
              };
            },
          }),
        );

        expect(inspected.failure).toContain(
          'legacy-aggregate-frontend-repo-persistence-reset-required',
        );
        expect(inspected.after).toEqual(inspected.before);

        yield* Effect.promise(() => abortAllDurableObjects());
        yield* Effect.promise(async () => {
          await expect(
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key,
              fn: () => undefined,
            }),
          ).rejects.toThrow(
            'legacy-aggregate-frontend-repo-persistence-reset-required',
          );
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'initializes and reopens the strict replica push command schema',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_frontend_repo_current_command_schema',
          aggregateId: 'acct_frontend_repo_current_command_schema',
          aggregateName: 'user',
          userId: 'user_frontend_repo_current_command_schema',
          frontendName: 'main',
        };
        const initialized = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendRepo,
            repo: AggregateFrontendRepo,
            key,
            fn: ({ state }) => ({
              outboxColumns: [
                ...state.storage.sql.exec<{ name: string }>(
                  'PRAGMA table_info(pushBlockOutbox)',
                ),
              ].map(column => column.name),
              failedStagedColumns: [
                ...state.storage.sql.exec<{ name: string }>(
                  'PRAGMA table_info(failedStagedCommands)',
                ),
              ].map(column => column.name),
              receipt: state.storage.kv.get(
                'aggregateFrontendCommandSchemaReceipt',
              ),
            }),
          }),
        );
        expect(initialized.outboxColumns).toEqual([
          'writeIndex',
          'requestBytes',
          'block',
          'finalizedAt',
          'failure',
        ]);
        expect(initialized.failedStagedColumns).toEqual(
          expect.arrayContaining([
            'id',
            'commandName',
            'payload',
            'systemName',
            'contractVersion',
            'commandType',
            'aggregateId',
            'aggregateName',
            'frontendName',
            'userId',
            'sessionId',
            'stagedCursor',
            'stagedAt',
            'replicaIndex',
            'pushedCursor',
            'aggregateCursor',
            'aggregateIndex',
            'failedAt',
            'failure',
            'status',
          ]),
        );
        expect(initialized.receipt).toBe('replica-push-command-schema-v1');

        yield* Effect.promise(() => abortAllDurableObjects());
        const reopened = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendRepo,
            repo: AggregateFrontendRepo,
            key,
            fn: ({ state }) => ({
              outboxColumns: [
                ...state.storage.sql.exec<{ name: string }>(
                  'PRAGMA table_info(pushBlockOutbox)',
                ),
              ].map(column => column.name),
              failedStagedColumns: [
                ...state.storage.sql.exec<{ name: string }>(
                  'PRAGMA table_info(failedStagedCommands)',
                ),
              ].map(column => column.name),
              receipt: state.storage.kv.get(
                'aggregateFrontendCommandSchemaReceipt',
              ),
            }),
          }),
        );
        expect(reopened).toEqual(initialized);
      }).pipe(Effect.provide(AsyncLive)),
  );
});
