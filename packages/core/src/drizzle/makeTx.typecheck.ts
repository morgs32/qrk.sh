import type { IAnyError } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Context, Effect } from 'effect';

import { Async } from '../async/Async.ts';

import { makeDbConfig } from './makeDbConfig.ts';
import { makeTx } from './makeTx.ts';
import type { IDb, IDbConfig, ITx } from './types.ts';

const config = makeDbConfig({
  tables: {
    entries: makeTable({
      name: 'entries',
      shape: { id: primitives.integer({ primaryKey: true }) },
    }),
  },
});
class Db extends Context.Service<Db, IDb<typeof config>>()('makeTxTypes.Db') {
  static readonly Tx = Context.Service<'makeTxTypes.Db.Tx', ITx<typeof config>>(
    'makeTxTypes.Db.Tx',
  );
}
class OtherDb extends Context.Service<OtherDb, IDb<typeof config>>()(
  'makeTxTypes.OtherDb',
) {
  static readonly Tx = Context.Service<
    'makeTxTypes.OtherDb.Tx',
    ITx<typeof config>
  >('makeTxTypes.OtherDb.Tx');
}
class Label extends Context.Service<Label, string>()('makeTxTypes.Label') {}

const write = makeTx(
  'makeTxTypes.write',
  Db,
)(function* (id: number) {
  const tx = yield* Db.Tx;
  const label = yield* Label;
  void tx.query.entries;
  // @ts-expect-error The transaction retains its exact query schema.
  void tx.query.missing;
  tx.insert(config.schema.entries).values({ id }).run();
  return { id, label };
});
declare const db: IDb<typeof config>;
export const provided: Effect.Effect<
  { id: number; label: string },
  IAnyError,
  Label
> = write(1).pipe(Effect.provideService(Db, db));
// @ts-expect-error Providing the database must not erase unrelated services.
export const missingLabel: Effect.Effect<unknown, IAnyError> = provided;
// @ts-expect-error An invocation still needs the database service.
export const missingDb: Effect.Effect<unknown, IAnyError, Label> = write(1);
// @ts-expect-error Inferred argument types survive makeTx.
write('wrong id');
makeTx(
  'makeTxTypes.async',
  Db,
)(
  // @ts-expect-error Async requirements are forbidden in the transaction body.
  function* () {
    yield* Async;
  },
);
makeTx(
  'makeTxTypes.promise',
  Db,
)(
  // @ts-expect-error Promise returns are forbidden even without the Async service.
  function* () {
    yield* Db.Tx;
    return Promise.resolve(1);
  },
);
// @ts-expect-error A database service must expose its transaction service.
makeTx('makeTxTypes.notDb', Label);

const crossDb = makeTx(
  'makeTxTypes.crossDb',
  Db,
)(function* () {
  yield* Db.Tx;
  yield* OtherDb.Tx;
});
// @ts-expect-error Same-schema databases still have distinct transaction requirements.
export const missingOtherTx: Effect.Effect<void, IAnyError, Db> = crossDb();

export function genericConfig<CONFIG extends IDbConfig>(db: IDb<CONFIG>) {
  class GenericDb extends Context.Service<GenericDb, IDb<CONFIG>>()(
    'makeTxTypes.GenericDb',
  ) {
    static readonly Tx = Context.Service<
      'makeTxTypes.GenericDb.Tx',
      ITx<CONFIG>
    >('makeTxTypes.GenericDb.Tx');
  }
  const genericWrite = makeTx(
    'makeTxTypes.genericWrite',
    GenericDb,
  )(function* () {
    const tx: ITx<CONFIG> = yield* GenericDb.Tx;
    return tx;
  });
  const result: Effect.Effect<ITx<CONFIG>, IAnyError> = genericWrite().pipe(
    Effect.provideService(GenericDb, db),
  );
  return result;
}
