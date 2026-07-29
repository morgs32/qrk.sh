/*
 * Persisted FrontendBlockRepo migration acceptance:
 *
 * 1. Recreate the pre-lineage archive table and raw FrontendBlock JSON rows.
 * 2. Bind immutable target lineage through the ordinary public repository RPC.
 * 3. Prove the legacy archive becomes strict target-bound canonical rows.
 * 4. Resume when lineage persisted before the archive rewrite completed.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { abortAllDurableObjects, runInDurableObject } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { getFrontendBlockRepo } from './getFrontendBlockRepo/getFrontendBlockRepo.js';

describe('FrontendBlockRepo persisted migrations', () => {
  it.effect(
    'rewrites a raw legacy archive once and preserves its exact logical suffix on re-entry',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_frontend_archive_raw_migration',
          accountId: 'acct_frontend_archive_raw_migration',
          accountName: 'user',
          actorName: 'main',
          actorId: 'actr_frontend_archive_raw_migration',
          frontendName: 'main',
        };
        const firstLegacyBlock = yield* Schema.decodeUnknown(
          FrontendBlockSchema,
        )({
          frontendName: key.frontendName,
          lastAccountCursor: 'acur_frontend_archive_raw_migration_1',
          frontendIndex: 1,
          lastRebasedPushedCursor: null,
          delta: { inserted: [], updated: [], deleted: [] },
          pendingPushedCommands: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        });
        const secondLegacyBlock = yield* Schema.decodeUnknown(
          FrontendBlockSchema,
        )({
          frontendName: key.frontendName,
          lastAccountCursor: 'acur_frontend_archive_raw_migration_2',
          frontendIndex: 2,
          lastRebasedPushedCursor: null,
          delta: { inserted: [], updated: [], deleted: [] },
          pendingPushedCommands: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        });
        const firstLegacyBytes = yield* Schema.encode(
          Schema.parseJson(FrontendBlockSchema),
        )(firstLegacyBlock);
        const secondLegacyBytes = yield* Schema.encode(
          Schema.parseJson(FrontendBlockSchema),
        )(secondLegacyBlock);
        let repo = yield* getFrontendBlockRepo({ key });

        yield* Effect.promise(() =>
          runInDurableObject(repo, (_instance, state) => {
            state.storage.sql.exec('DROP TABLE frontendBlocks');
            state.storage.sql.exec(
              'CREATE TABLE frontendBlocks (frontendIndex INTEGER NOT NULL UNIQUE, block TEXT NOT NULL)',
            );
            state.storage.sql.exec(
              'INSERT INTO frontendBlocks (frontendIndex, block) VALUES (?, ?)',
              1,
              firstLegacyBytes,
            );
            state.storage.sql.exec(
              'INSERT INTO frontendBlocks (frontendIndex, block) VALUES (?, ?)',
              2,
              secondLegacyBytes,
            );
          }),
        );

        yield* Effect.promise(() => abortAllDurableObjects());
        repo = yield* getFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const migratedBlocks = yield* makeAsync(() =>
          repo.getArchivedBlocks({
            afterFrontendIndex: 0,
            throughFrontendIndex: 2,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(migratedBlocks).toEqual([
          {
            kind: 'frontend',
            systemId: 'sys_local',
            generationId: key.generationId,
            accountId: key.accountId,
            accountName: key.accountName,
            actorId: key.actorId,
            actorName: key.actorName,
            frontendName: key.frontendName,
            frontendBlock: firstLegacyBlock,
          },
          {
            kind: 'frontend',
            systemId: 'sys_local',
            generationId: key.generationId,
            accountId: key.accountId,
            accountName: key.accountName,
            actorId: key.actorId,
            actorName: key.actorName,
            frontendName: key.frontendName,
            frontendBlock: secondLegacyBlock,
          },
        ]);

        const migratedStorage = yield* Effect.promise(() =>
          runInDurableObject(repo, (_instance, state) => ({
            columns: Array.from(
              state.storage.sql.exec<{ name: string }>(
                'PRAGMA table_info(frontendBlocks)',
              ),
            ),
            rows: Array.from(
              state.storage.sql.exec<{
                frontendIndex: number;
                canonicalBytes: string;
                lineageBlock: string;
              }>(
                'SELECT frontendIndex, canonicalBytes, lineageBlock FROM frontendBlocks ORDER BY frontendIndex ASC',
              ),
            ),
            legacyTable: Array.from(
              state.storage.sql.exec<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'frontendBlocks_legacy_034'",
              ),
            ),
          })),
        );
        expect(migratedStorage.columns).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'frontendIndex' }),
            expect.objectContaining({ name: 'canonicalBytes' }),
            expect.objectContaining({ name: 'lineageBlock' }),
          ]),
        );
        expect(migratedStorage.columns).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ name: 'block' })]),
        );
        expect(migratedStorage.rows).toHaveLength(2);
        expect(migratedStorage.rows[0]?.canonicalBytes).toBe(
          migratedStorage.rows[0]?.lineageBlock,
        );
        expect(migratedStorage.rows[1]?.canonicalBytes).toBe(
          migratedStorage.rows[1]?.lineageBlock,
        );
        expect(migratedStorage.legacyTable).toEqual([]);

        // The current table shape is the durable one-time receipt. A cold
        // exact retry leaves the same canonical rows byte-for-byte unchanged.
        yield* Effect.promise(() => abortAllDurableObjects());
        repo = yield* getFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const secondStorage = yield* Effect.promise(() =>
          runInDurableObject(repo, (_instance, state) => ({
            rows: Array.from(
              state.storage.sql.exec<{
                frontendIndex: number;
                canonicalBytes: string;
                lineageBlock: string;
              }>(
                'SELECT frontendIndex, canonicalBytes, lineageBlock FROM frontendBlocks ORDER BY frontendIndex ASC',
              ),
            ),
            lineageCount: Array.from(
              state.storage.sql.exec<{ count: number }>(
                'SELECT COUNT(*) AS count FROM lineage',
              ),
            )[0]?.count,
          })),
        );
        expect(secondStorage.rows).toEqual(migratedStorage.rows);
        expect(secondStorage.lineageCount).toBe(1);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'resumes when immutable lineage committed before the legacy archive rewrite',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_frontend_archive_interrupted_migration',
          accountId: 'acct_frontend_archive_interrupted_migration',
          accountName: 'user',
          actorName: 'main',
          actorId: 'actr_frontend_archive_interrupted_migration',
          frontendName: 'main',
        };
        const legacyBlock = yield* Schema.decodeUnknown(FrontendBlockSchema)({
          frontendName: key.frontendName,
          lastAccountCursor: 'acur_frontend_archive_interrupted_migration_1',
          frontendIndex: 1,
          lastRebasedPushedCursor: null,
          delta: { inserted: [], updated: [], deleted: [] },
          pendingPushedCommands: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        });
        const legacyBytes = yield* Schema.encode(
          Schema.parseJson(FrontendBlockSchema),
        )(legacyBlock);
        let repo = yield* getFrontendBlockRepo({ key });

        yield* Effect.promise(() =>
          runInDurableObject(repo, (_instance, state) => {
            state.storage.sql.exec(
              `INSERT INTO lineage (
                id,
                systemId,
                generationId,
                accountId,
                accountName,
                actorName,
                actorId,
                frontendName,
                predecessorGenerationId,
                predecessorRepoName,
                predecessorTerminalFrontendIndex
              ) VALUES ('lineage', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
              'sys_local',
              key.generationId,
              key.accountId,
              key.accountName,
              key.actorName,
              key.actorId,
              key.frontendName,
            );
            state.storage.sql.exec('DROP TABLE frontendBlocks');
            state.storage.sql.exec(
              'CREATE TABLE frontendBlocks (frontendIndex INTEGER NOT NULL UNIQUE, block TEXT NOT NULL)',
            );
            state.storage.sql.exec(
              'INSERT INTO frontendBlocks (frontendIndex, block) VALUES (?, ?)',
              1,
              legacyBytes,
            );
          }),
        );

        yield* Effect.promise(() => abortAllDurableObjects());
        repo = yield* getFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const predecessor = yield* makeAsync(() =>
          repo.getPredecessor(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(predecessor).toEqual({
          systemId: 'sys_local',
          generationId: key.generationId,
          terminalFrontendIndex: 1,
          predecessor: null,
        });
        const migratedBlocks = yield* makeAsync(() =>
          repo.getArchivedBlocks({
            afterFrontendIndex: 0,
            throughFrontendIndex: 1,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(migratedBlocks).toEqual([
          {
            kind: 'frontend',
            systemId: 'sys_local',
            generationId: key.generationId,
            accountId: key.accountId,
            accountName: key.accountName,
            actorId: key.actorId,
            actorName: key.actorName,
            frontendName: key.frontendName,
            frontendBlock: legacyBlock,
          },
        ]);

        yield* Effect.promise(() => abortAllDurableObjects());
        repo = yield* getFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const finalStorage = yield* Effect.promise(() =>
          runInDurableObject(repo, (_instance, state) => ({
            rows: Array.from(
              state.storage.sql.exec<{
                frontendIndex: number;
                canonicalBytes: string;
                lineageBlock: string;
              }>(
                'SELECT frontendIndex, canonicalBytes, lineageBlock FROM frontendBlocks',
              ),
            ),
            lineageCount: Array.from(
              state.storage.sql.exec<{ count: number }>(
                'SELECT COUNT(*) AS count FROM lineage',
              ),
            )[0]?.count,
          })),
        );
        expect(finalStorage.rows).toHaveLength(1);
        expect(finalStorage.rows[0]?.canonicalBytes).toBe(
          finalStorage.rows[0]?.lineageBlock,
        );
        expect(finalStorage.lineageCount).toBe(1);
      }).pipe(Effect.provide(AsyncLive)),
  );
});
