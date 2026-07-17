import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/makeDbConfig";
import { makeMigratedInMemoryWasmSqliteDb } from "@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb";
import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";
import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { makeLiveQuery } from "./makeLiveQuery.js";

const User = makeModel(
  {
    abbreviation: "usr",
    modelName: "user",
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: "1.0.0",
  },
  [],
);

const Product = makeModel(
  {
    abbreviation: "prd",
    modelName: "product",
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: "1.0.0",
  },
  [],
);

const dbConfig = makeResourceDbConfig({
  models: {
    product: Product,
    user: User,
  },
});

const now = new Date("2026-01-01T00:00:00.000Z");

describe("makeLiveQuery", () => {
  it("tracks inferred tables, ignores unrelated writes, and stops after cleanup", async () => {
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      const query = db
        .select({ value: sql<number>`count(*)` })
        .from(dbConfig.schema.user);
      const liveQuery = makeLiveQuery({
        client: db.$client,
        query,
        tableNames: [],
      });

      expect(liveQuery.store.getState()).toEqual({
        data: [{ value: 0 }],
        error: undefined,
        updatedAt: undefined,
      });

      const unsubscribe = liveQuery.subscribe();
      const updatedAtAfterSubscribe = liveQuery.store.getState().updatedAt;

      db.insert(dbConfig.schema.product)
        .values({
          createdAt: now,
          id: "prd_1",
          modelName: "product",
          name: "Product 1",
          updatedAt: now,
          version: "1.0.0",
        })
        .run();

      expect(liveQuery.store.getState().data).toEqual([{ value: 0 }]);
      expect(liveQuery.store.getState().updatedAt).toBe(
        updatedAtAfterSubscribe,
      );

      db.insert(dbConfig.schema.user)
        .values({
          createdAt: now,
          id: "usr_1",
          modelName: "user",
          name: "User 1",
          updatedAt: now,
          version: "1.0.0",
        })
        .run();

      expect(liveQuery.store.getState().data).toEqual([{ value: 1 }]);
      expect(liveQuery.store.getState().updatedAt).not.toBe(
        updatedAtAfterSubscribe,
      );

      unsubscribe();

      db.insert(dbConfig.schema.user)
        .values({
          createdAt: now,
          id: "usr_2",
          modelName: "user",
          name: "User 2",
          updatedAt: now,
          version: "1.0.0",
        })
        .run();

      expect(liveQuery.store.getState().data).toEqual([{ value: 1 }]);
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it("refreshes once after transaction commit and safely reruns after delete", async () => {
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      db.insert(dbConfig.schema.user)
        .values({
          createdAt: now,
          id: "usr_1",
          modelName: "user",
          name: "User 1",
          updatedAt: now,
          version: "1.0.0",
        })
        .run();

      const query = db
        .select({ value: sql<number>`count(*)` })
        .from(dbConfig.schema.user);
      const originalAll = query.all.bind(query);
      let rerunCount = 0;
      query.all = () => {
        rerunCount++;
        return originalAll();
      };

      const liveQuery = makeLiveQuery({
        client: db.$client,
        query,
        tableNames: ["user", "product"],
      });
      const unsubscribe = liveQuery.subscribe();
      rerunCount = 0;

      db.transaction(tx => {
        // The delete is the exact operation that previously invoked a nested
        // SELECT from update_hook while sqlite3_step was still active.
        tx.delete(dbConfig.schema.user)
          .where(eq(dbConfig.schema.user.id, "usr_1"))
          .run();
        tx.insert(dbConfig.schema.product)
          .values({
            createdAt: now,
            id: "prd_1",
            modelName: "product",
            name: "Product 1",
            updatedAt: now,
            version: "1.0.0",
          })
          .run();
        tx.insert(dbConfig.schema.user)
          .values({
            createdAt: now,
            id: "usr_2",
            modelName: "user",
            name: "User 2",
            updatedAt: now,
            version: "1.0.0",
          })
          .run();

        expect(liveQuery.store.getState().data).toEqual([{ value: 1 }]);
        expect(rerunCount).toBe(0);
      });

      expect(liveQuery.store.getState().data).toEqual([{ value: 1 }]);
      expect(liveQuery.store.getState().error).toBeUndefined();
      expect(rerunCount).toBe(1);

      unsubscribe();
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it("discards outer rollback changes and defers savepoints to outer commit", async () => {
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      const query = db
        .select({ value: sql<number>`count(*)` })
        .from(dbConfig.schema.user);
      const originalAll = query.all.bind(query);
      let rerunCount = 0;
      query.all = () => {
        rerunCount++;
        return originalAll();
      };

      const liveQuery = makeLiveQuery({
        client: db.$client,
        query,
        tableNames: ["user"],
      });
      const unsubscribe = liveQuery.subscribe();
      rerunCount = 0;

      expect(() =>
        db.transaction(tx => {
          tx.insert(dbConfig.schema.user)
            .values({
              createdAt: now,
              id: "usr_rollback",
              modelName: "user",
              name: "Rolled Back User",
              updatedAt: now,
              version: "1.0.0",
            })
            .run();

          expect(liveQuery.store.getState().data).toEqual([{ value: 0 }]);
          expect(rerunCount).toBe(0);
          throw new Error("rollback outer transaction");
        }),
      ).toThrow("rollback outer transaction");

      expect(liveQuery.store.getState().data).toEqual([{ value: 0 }]);
      expect(rerunCount).toBe(0);

      db.transaction(tx => {
        try {
          tx.transaction(savepointTx => {
            savepointTx
              .insert(dbConfig.schema.user)
              .values({
                createdAt: now,
                id: "usr_savepoint",
                modelName: "user",
                name: "Savepoint User",
                updatedAt: now,
                version: "1.0.0",
              })
              .run();
            throw new Error("rollback savepoint");
          });
        } catch (error) {
          expect(error).toEqual(new Error("rollback savepoint"));
        }

        // Commit an unrelated table so SQLite reaches the outer commit hook.
        // The rolled-back savepoint's user invalidation intentionally remains
        // in the batch and causes one harmless final-state rerun.
        tx.insert(dbConfig.schema.product)
          .values({
            createdAt: now,
            id: "prd_savepoint",
            modelName: "product",
            name: "Savepoint Product",
            updatedAt: now,
            version: "1.0.0",
          })
          .run();

        expect(liveQuery.store.getState().data).toEqual([{ value: 0 }]);
        expect(rerunCount).toBe(0);
      });

      expect(liveQuery.store.getState().data).toEqual([{ value: 0 }]);
      expect(rerunCount).toBe(1);

      unsubscribe();
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it("discards invalidations from an aborted autocommit statement", async () => {
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      db.insert(dbConfig.schema.user)
        .values({
          createdAt: now,
          id: "usr_existing",
          modelName: "user",
          name: "Existing User",
          updatedAt: now,
          version: "1.0.0",
        })
        .run();

      const query = db
        .select({ value: sql<number>`count(*)` })
        .from(dbConfig.schema.user);
      const originalAll = query.all.bind(query);
      let rerunCount = 0;
      query.all = () => {
        rerunCount++;
        return originalAll();
      };

      const liveQuery = makeLiveQuery({
        client: db.$client,
        query,
        tableNames: [],
      });
      const unsubscribe = liveQuery.subscribe();
      rerunCount = 0;

      // SQLite can invoke update_hook for an early row before a later row
      // aborts the complete statement. No commit hook follows that rollback.
      expect(() =>
        db
          .insert(dbConfig.schema.user)
          .values([
            {
              createdAt: now,
              id: "usr_aborted",
              modelName: "user",
              name: "Aborted User",
              updatedAt: now,
              version: "1.0.0",
            },
            {
              createdAt: now,
              id: "usr_existing",
              modelName: "user",
              name: "Duplicate Existing User",
              updatedAt: now,
              version: "1.0.0",
            },
          ])
          .run(),
      ).toThrow();

      expect(liveQuery.store.getState().data).toEqual([{ value: 1 }]);
      expect(rerunCount).toBe(0);

      // A later unrelated commit must not flush the aborted user table name.
      db.insert(dbConfig.schema.product)
        .values({
          createdAt: now,
          id: "prd_after_abort",
          modelName: "product",
          name: "Product After Abort",
          updatedAt: now,
          version: "1.0.0",
        })
        .run();

      expect(liveQuery.store.getState().data).toEqual([{ value: 1 }]);
      expect(rerunCount).toBe(0);

      db.insert(dbConfig.schema.user)
        .values({
          createdAt: now,
          id: "usr_after_abort",
          modelName: "user",
          name: "User After Abort",
          updatedAt: now,
          version: "1.0.0",
        })
        .run();

      expect(liveQuery.store.getState().data).toEqual([{ value: 2 }]);
      expect(rerunCount).toBe(1);

      unsubscribe();
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it("requires explicit table names for raw SQL sources", async () => {
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      const query = db
        .select({ value: sql<number>`value` })
        .from(sql`(select 1 as value) as raw_source`);
      const liveQuery = makeLiveQuery({
        client: db.$client,
        query,
        tableNames: [],
      });

      const unsubscribe = liveQuery.subscribe();

      expect(liveQuery.store.getState().data).toEqual([{ value: 1 }]);
      expect(liveQuery.store.getState().error?.message).toContain(
        "explicit tableNames",
      );

      unsubscribe();
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });

  it("uses explicit raw-query tables and recovers from rerun failures", async () => {
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    try {
      const query = db.select({ value: sql<number>`count(*)` }).from(sql`user`);
      const originalAll = query.all.bind(query);
      let shouldFail = false;
      query.all = () => {
        if (shouldFail) {
          throw new Error("query rerun failed");
        }
        return originalAll();
      };

      const liveQuery = makeLiveQuery({
        client: db.$client,
        query,
        tableNames: ["user"],
      });
      const unsubscribe = liveQuery.subscribe();
      const healthyLiveQuery = makeLiveQuery({
        client: db.$client,
        query: db.select({ value: sql<number>`count(*)` }).from(sql`user`),
        tableNames: ["user"],
      });
      const unsubscribeHealthyLiveQuery = healthyLiveQuery.subscribe();

      shouldFail = true;
      db.insert(dbConfig.schema.user)
        .values({
          createdAt: now,
          id: "usr_1",
          modelName: "user",
          name: "User 1",
          updatedAt: now,
          version: "1.0.0",
        })
        .run();

      expect(liveQuery.store.getState().error?.message).toBe(
        "query rerun failed",
      );
      expect(liveQuery.store.getState().data).toEqual([{ value: 0 }]);
      expect(healthyLiveQuery.store.getState().data).toEqual([{ value: 1 }]);

      shouldFail = false;
      db.insert(dbConfig.schema.user)
        .values({
          createdAt: now,
          id: "usr_2",
          modelName: "user",
          name: "User 2",
          updatedAt: now,
          version: "1.0.0",
        })
        .run();

      expect(liveQuery.store.getState().error).toBeUndefined();
      expect(liveQuery.store.getState().data).toEqual([{ value: 2 }]);
      expect(healthyLiveQuery.store.getState().data).toEqual([{ value: 2 }]);

      unsubscribe();
      unsubscribeHealthyLiveQuery();
    } finally {
      await db.$client.sqlite3.close(db.$client.db);
    }
  });
});
