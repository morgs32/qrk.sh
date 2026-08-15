/*
 * SystemRepo is a fresh system-id-addressed database. Its abandoned
 * generation-addressed predecessors are intentionally not discovered or
 * adapted here.
 */

import { migrateDb } from '@zerospin/core/drizzle/migrateDb';
import type {
  IDb,
  IDbConfig,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';

export const migrateSystemRepo = Effect.fn('SystemRepo.migrateSystemRepo')(
  function* <CONFIG extends IDbConfig>(props: {
    db: IDb<CONFIG>;
    schema: IDbConfigSchema<CONFIG>;
  }) {
    yield* migrateDb(props);
  },
);
