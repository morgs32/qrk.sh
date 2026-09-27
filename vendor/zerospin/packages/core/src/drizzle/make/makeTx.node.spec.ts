import { it } from '@effect/vitest';
import type { IZerospinError } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { drizzle } from 'drizzle-orm/sql-js';
import { Cause, Context, Effect, Exit, Option } from 'effect';
import initSqlJs, { type Database } from 'sql.js';
import { afterEach, beforeAll, describe, expect, expectTypeOf } from 'vitest';

import { Async } from '../../async/Async.ts';
import type { IDb, ITx } from '../types.ts';

import { makeDbConfig } from './makeDbConfig/makeDbConfig.ts';
import { makeTx } from './makeTx.ts';

const config = makeDbConfig({
  tables: {
    entries: makeTable({
      name: 'entries',
      shape: { id: primitives.integer({ primaryKey: true }) },
    }),
  },
});
class Offset extends Context.Service<Offset, number>()('MakeTxSpec.Offset') {}
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const clients: Database[] = [];
beforeAll(async () => {
  SQL = await initSqlJs();
});
afterEach(() => {
  for (const client of clients.splice(0)) client.close();
});
function fixture() {
  const client = new SQL.Database();
  clients.push(client);
  client.run('CREATE TABLE entries (id INTEGER PRIMARY KEY)');
  return drizzle(client, { relations: config.relations });
}
function failure<A, E>(exit: Exit.Exit<A, E>) {
  if (Exit.isSuccess(exit)) throw new Error('Expected failure');
  return Option.getOrThrow(Cause.findErrorOption(exit.cause));
}

describe('makeTx', () => {
  it.effect(
    'commits writes and preserves arguments, results, and caller context',
    () =>
      Effect.gen(function* () {
        const db = fixture();
        const insert = makeTx('insert')(function* (
          tx: ITx<typeof config>,
          id: number,
        ) {
          const offset = yield* Offset;
          tx.insert(config.schema.entries)
            .values({ id: id + offset })
            .run();
          return id + offset;
        });
        const result = yield* insert(db, 3).pipe(
          Effect.provideService(Offset, 2),
        );
        expect(result).toBe(5);
        expect(db.select().from(config.schema.entries).all()).toEqual([
          { id: 5 },
        ]);
        expectTypeOf<
          Effect.Success<ReturnType<typeof insert>>
        >().toEqualTypeOf<number>();
        expectTypeOf<
          Effect.Services<ReturnType<typeof insert>>
        >().toEqualTypeOf<Offset>();
      }),
  );

  it.effect('rolls back all writes and preserves the authored failure', () =>
    Effect.gen(function* () {
      const db = fixture();
      const refused = { code: 'refused' } as const;
      const insert = makeTx('refused')(function* (tx: ITx<typeof config>) {
        tx.insert(config.schema.entries).values({ id: 1 }).run();
        tx.insert(config.schema.entries).values({ id: 2 }).run();
        return yield* Effect.fail(refused);
      });
      expectTypeOf<Effect.Error<ReturnType<typeof insert>>>().toEqualTypeOf<
        typeof refused | IZerospinError<'drizzle-transaction-failed'>
      >();
      expect(failure(yield* Effect.exit(insert(db)))).toBe(refused);
      expect(db.select().from(config.schema.entries).all()).toEqual([]);
    }),
  );

  it.effect(
    'returns the result while always rolling back speculative writes',
    () =>
      Effect.gen(function* () {
        const db = fixture();
        const speculate = makeTx('speculate', { rollback: 'always' })(
          function* (tx: ITx<typeof config>) {
            yield* Effect.void;
            tx.insert(config.schema.entries).values({ id: 1 }).run();
            return tx.select().from(config.schema.entries).all();
          },
        );
        expect(yield* speculate(db)).toEqual([{ id: 1 }]);
        expect(db.select().from(config.schema.entries).all()).toEqual([]);
      }),
  );

  it.effect(
    'rejects nested transactions and permits a later independent transaction',
    () =>
      Effect.gen(function* () {
        const db = fixture();
        const inner = makeTx('inner')(function* (tx: ITx<typeof config>) {
          yield* Effect.void;
          tx.insert(config.schema.entries).values({ id: 2 }).run();
        });
        const outer = makeTx('outer')(function* (tx: ITx<typeof config>) {
          tx.insert(config.schema.entries).values({ id: 1 }).run();
          yield* inner(db);
        });
        expect(failure(yield* Effect.exit(outer(db))).code).toBe(
          'drizzle-transaction-failed',
        );
        expect(db.select().from(config.schema.entries).all()).toEqual([]);
        yield* inner(db);
        expect(db.select().from(config.schema.entries).all()).toEqual([
          { id: 2 },
        ]);
      }),
  );

  it.effect(
    'cancels suspended work before rollback so it cannot resume writes',
    () =>
      Effect.gen(function* () {
        const db = fixture();
        let resume: (() => void) | undefined;
        let cancelled = false;
        let resumed = false;
        const suspended = makeTx('suspended')(function* (
          tx: ITx<typeof config>,
        ) {
          tx.insert(config.schema.entries).values({ id: 1 }).run();
          yield* Effect.callback<void>(callback => {
            resume = () => callback(Effect.void);
            return Effect.sync(() => {
              cancelled = true;
            });
          });
          resumed = true;
          tx.insert(config.schema.entries).values({ id: 2 }).run();
        });
        expect(failure(yield* Effect.exit(suspended(db))).code).toBe(
          'drizzle-transaction-failed',
        );
        expect(cancelled).toBe(true);
        expect(resume).toBeDefined();
        resume?.();
        yield* Effect.yieldNow;
        expect(resumed).toBe(false);
        expect(db.select().from(config.schema.entries).all()).toEqual([]);
      }),
  );

  it.effect('maps a thrown database defect and rolls back', () =>
    Effect.gen(function* () {
      const db = fixture();
      const duplicate = makeTx('duplicate')(function* (tx: ITx<typeof config>) {
        yield* Effect.void;
        tx.insert(config.schema.entries).values({ id: 1 }).run();
        tx.insert(config.schema.entries).values({ id: 1 }).run();
      });
      expect(failure(yield* Effect.exit(duplicate(db))).code).toBe(
        'drizzle-transaction-failed',
      );
      expect(db.select().from(config.schema.entries).all()).toEqual([]);
    }),
  );
});

// These programs are compiler assertions only; they are never executed.
function checkTypes(db: IDb<typeof config>) {
  // @ts-expect-error Async dependencies cannot run inside a synchronous transaction.
  makeTx('async')(function* (tx: ITx<typeof config>) {
    yield* Async;
    return tx;
  });
  // @ts-expect-error Transaction results cannot be promises.
  makeTx('promise')(function* (tx: ITx<typeof config>) {
    yield* Effect.void;
    return Promise.resolve(tx);
  });
  const read = makeTx('typed')(function* (tx: ITx<typeof config>, id: number) {
    yield* Effect.void;
    expectTypeOf(tx).toEqualTypeOf<ITx<typeof config>>();
    // @ts-expect-error Unknown relational queries are not exposed by the schema.
    void tx.query.missing;
    return id;
  });
  read(db, 1);
  const emptyConfig = makeDbConfig({ tables: {} });
  const wrongDb = drizzle(new SQL.Database(), {
    relations: emptyConfig.relations,
  });
  // @ts-expect-error A database missing required relations cannot run this program.
  read(wrongDb, 1);
  expectTypeOf<Parameters<typeof read>[0]>().toEqualTypeOf<
    IDb<typeof config>
  >();
  // @ts-expect-error Arguments retain their declared types.
  read(db, '1');
}
void checkTypes;
