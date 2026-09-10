import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { Db, provisionDbTx } from './provisionDbTx.ts';
import type { IDb, IDbConfig, IDbConfigSchema } from './types.ts';

export const provisionDb = Effect.fn('provisionDb')(function* <
  CONFIG extends IDbConfig,
>(props: {
  db: IDb<CONFIG>;
  schema: IDbConfigSchema<CONFIG>;
}): Effect.fn.Return<void, IAnyError> {
  const { db, schema } = props;

  yield* provisionDbTx({ schema }).pipe(Effect.provideService(Db, db));
});
