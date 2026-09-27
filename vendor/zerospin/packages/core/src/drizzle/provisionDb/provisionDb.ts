import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IDb, IDbConfig, IDbConfigSchema } from '../types.ts';

import { provisionDbTx } from './provisionDbTx/provisionDbTx.ts';

export const provisionDb = Effect.fn('provisionDb')(function* <
  CONFIG extends IDbConfig,
>(props: {
  db: IDb<CONFIG>;
  schema: IDbConfigSchema<CONFIG>;
}): Effect.fn.Return<void, IAnyError> {
  const { db, schema } = props;

  yield* provisionDbTx(db, { schema });
});
