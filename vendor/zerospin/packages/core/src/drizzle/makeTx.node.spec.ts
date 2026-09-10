import { it } from '@effect/vitest';
import { ZerospinError } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Context, Effect } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';

import { makeDbConfig } from './makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from './makeProvisionedInMemorySqljsDb.ts';
import { makeTx } from './makeTx.ts';
import type { IDb, ITx } from './types.ts';

const dbConfig = makeDbConfig({
  tables: {
    entries: makeTable({
      name: 'entries',
      shape: {
        id: primitives.integer({ primaryKey: true }),
        label: primitives.text(),
      },
    }),
  },
});
class Db extends Context.Service<Db, IDb<typeof dbConfig>>()('makeTxSpec.Db') {
  static readonly Tx = Context.Service<
    'makeTxSpec.Db.Tx',
    ITx<typeof dbConfig>
  >('makeTxSpec.Db.Tx');
}
class Label extends Context.Service<Label, string>()('makeTxSpec.Label') {}

const insertEntry = Effect.fn('makeTxSpec.insertEntry')(function* (id: number) {
  const tx = yield* Db.Tx;
  const label = yield* Label;
  tx.insert(dbConfig.schema.entries).values({ id, label }).run();
});

const write = makeTx(
  'makeTxSpec.write',
  Db,
)(function* (id: number) {
  yield* insertEntry(id);
  return id;
});

describe('makeTx', () => {
  it.effect(
    'commits a named program and supplies its transaction to a child procedure',
    () =>
      Effect.gen(function* () {
        const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
        const result = yield* write(1).pipe(
          Effect.provideService(Db, db),
          Effect.provideService(Label, 'committed'),
        );
        expect(result).toBe(1);
        expect(db.select().from(dbConfig.schema.entries).all()).toEqual([
          { id: 1, label: 'committed' },
        ]);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('preserves a domain failure and rolls back every write', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      const failure = new ZerospinError({
        code: 'make-tx-domain-failure',
        message: 'Rollback the batch',
      });
      const rejected = makeTx(
        'makeTxSpec.reject',
        Db,
      )(function* () {
        yield* insertEntry(1);
        yield* insertEntry(2);
        return yield* failure;
      });
      const result = yield* rejected().pipe(
        Effect.provideService(Db, db),
        Effect.provideService(Label, 'rolled back'),
        Effect.flip,
      );
      expect(result).toBe(failure);
      expect(db.select().from(dbConfig.schema.entries).all()).toEqual([]);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rolls back defects and releases the transaction guard', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      const defective = makeTx(
        'makeTxSpec.defect',
        Db,
      )(function* () {
        yield* insertEntry(1);
        return yield* Effect.die('unexpected failure');
      });
      const failure = yield* defective().pipe(
        Effect.provideService(Db, db),
        Effect.provideService(Label, 'rolled back'),
        Effect.flip,
      );
      expect(failure.code).toBe('drizzle-transaction-failed');
      expect(db.select().from(dbConfig.schema.entries).all()).toEqual([]);
      yield* write(2).pipe(
        Effect.provideService(Db, db),
        Effect.provideService(Label, 'next transaction'),
      );
      expect(db.select().from(dbConfig.schema.entries).all()).toEqual([
        { id: 2, label: 'next transaction' },
      ]);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'rejects suspension, rolls back, and does not resume transaction writes later',
    () =>
      Effect.gen(function* () {
        const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
        const suspended = makeTx(
          'makeTxSpec.suspend',
          Db,
        )(function* () {
          yield* insertEntry(1);
          yield* Effect.sleep('1 millis');
          yield* insertEntry(2);
        });
        const failure = yield* suspended().pipe(
          Effect.provideService(Db, db),
          Effect.provideService(Label, 'rolled back'),
          Effect.flip,
        );
        expect(failure.code).toBe('drizzle-transaction-failed');
        yield* TestClock.adjust('10 millis');
        expect(db.select().from(dbConfig.schema.entries).all()).toEqual([]);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rejects nested makeTx and rolls back the outer transaction', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      const nested = makeTx(
        'makeTxSpec.nested',
        Db,
      )(function* () {
        yield* insertEntry(1);
        return yield* write(2);
      });
      const failure = yield* nested().pipe(
        Effect.provideService(Db, db),
        Effect.provideService(Label, 'rolled back'),
        Effect.flip,
      );
      expect(failure.code).toBe('drizzle-transaction-failed');
      expect(db.select().from(dbConfig.schema.entries).all()).toEqual([]);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('keeps separate database invocations isolated', () =>
    Effect.gen(function* () {
      const first = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      const second = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      yield* write(1).pipe(
        Effect.provideService(Db, first),
        Effect.provideService(Label, 'first'),
      );
      yield* write(2).pipe(
        Effect.provideService(Db, second),
        Effect.provideService(Label, 'second'),
      );
      expect(first.select().from(dbConfig.schema.entries).all()).toEqual([
        { id: 1, label: 'first' },
      ]);
      expect(second.select().from(dbConfig.schema.entries).all()).toEqual([
        { id: 2, label: 'second' },
      ]);
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('rolls back a synchronous Drizzle exception', () =>
    Effect.gen(function* () {
      const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig });
      const duplicate = makeTx(
        'makeTxSpec.duplicate',
        Db,
      )(function* () {
        yield* insertEntry(1);
        yield* insertEntry(1);
      });
      const failure = yield* duplicate().pipe(
        Effect.provideService(Db, db),
        Effect.provideService(Label, 'duplicate'),
        Effect.flip,
      );
      expect(failure.code).toBe('drizzle-transaction-failed');
      expect(db.select().from(dbConfig.schema.entries).all()).toEqual([]);
    }).pipe(Effect.provide(AsyncLive)),
  );
});
