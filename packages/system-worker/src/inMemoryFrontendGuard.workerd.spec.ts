import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb';
import type { IDb } from '@zerospin/core/drizzle/types';
import { List, User } from '@zerospin/core/fixtures/system';
import { runGuard } from '@zerospin/core/guards/runGuard';
import { ZerospinError } from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sql-js';
import { Effect, Result } from 'effect';
import initSqlJs from 'sql.js';
import wasm from 'sql.js/dist/sql-wasm.wasm';
import { expect, it } from 'vitest';

// Feasibility only: real SQLite + Drizzle, with Workers' precompiled WASM
// loading in place of makeInMemorySqlJsDatabase's default filesystem loader.
it('installs selected snapshots and runs frontend guards synchronously in workerd', async () => {
  const SQL = await initSqlJs({
    instantiateWasm(imports, receiveInstance) {
      const instance = new WebAssembly.Instance(wasm, imports);
      receiveInstance(instance);
      return instance.exports;
    },
  });
  const client = new SQL.Database();
  try {
    client.exec('PRAGMA foreign_keys = ON');
    const dbConfig = makeResourceDbConfig({
      models: { user: User, list: List },
    });
    const db = drizzle(client, { relations: dbConfig.relations });
    const now = new Date('2026-09-06T12:00:00.000Z');

    // Everything after engine initialization must finish without suspension.
    Effect.runSync(
      Effect.gen(function* () {
        yield* provisionDb({ db, schema: dbConfig.schema });
        const guard = Effect.fn('spike.selectedFrontendGuard')(
          function* (props: {
            db: IDb<typeof dbConfig>;
            userId: `usr_${string}`;
            payload: { listId: `lst_${string}` };
          }) {
            const user = props.db
              .select()
              .from(dbConfig.schema.user)
              .where(eq(dbConfig.schema.user.id, props.userId))
              .get();
            const ownedList = props.db
              .select({ name: dbConfig.schema.list.name })
              .from(dbConfig.schema.list)
              .innerJoin(
                dbConfig.schema.user,
                eq(dbConfig.schema.list.userId, dbConfig.schema.user.id),
              )
              .where(
                and(
                  eq(dbConfig.schema.list.id, props.payload.listId),
                  eq(dbConfig.schema.user.id, props.userId),
                ),
              )
              .get();
            if (user === undefined || ownedList === undefined) {
              return yield* new ZerospinError({
                code: 'spike-selected-resource-missing',
                message:
                  'The selected graph does not contain the requested user/list',
              });
            }
            expect(user.createdAt).toEqual(now);
            expect(user.updatedAt).toEqual(now);
            expect(ownedList.name).toBe('Selected list');
          },
        );

        for (const { userId, listId } of [
          { userId: 'usr_spikealice', listId: 'lst_spikealice' },
          { userId: 'usr_spikebob', listId: 'lst_spikebob' },
        ] satisfies ReadonlyArray<{
          userId: `usr_${string}`;
          listId: `lst_${string}`;
        }>) {
          db.transaction(tx => {
            tx.delete(dbConfig.schema.list).run();
            tx.delete(dbConfig.schema.user).run();
            tx.insert(dbConfig.schema.user)
              .values({
                id: userId,
                modelName: User.modelName,
                version: User.version,
                name: userId,
                createdAt: now,
                updatedAt: now,
              })
              .run();
            tx.insert(dbConfig.schema.list)
              .values({
                id: listId,
                modelName: List.modelName,
                version: List.version,
                name: 'Selected list',
                userId,
                createdAt: now,
                updatedAt: now,
              })
              .run();
          });
          yield* runGuard({
            guard,
            props: { db, userId, payload: { listId } },
          });
          const rejected = yield* runGuard({
            guard,
            props: { db, userId, payload: { listId: 'lst_absent' } },
          }).pipe(Effect.result);
          expect(Result.isFailure(rejected)).toBe(true);
          if (Result.isFailure(rejected)) {
            expect(rejected.failure.code).toBe(
              'spike-selected-resource-missing',
            );
          }
          expect(
            db
              .select()
              .from(dbConfig.schema.user)
              .all()
              .map(row => row.id),
          ).toEqual([userId]);
          expect(
            db
              .select()
              .from(dbConfig.schema.list)
              .all()
              .map(row => row.id),
          ).toEqual([listId]);
        }
      }),
    );
  } finally {
    client.close();
  }
});
