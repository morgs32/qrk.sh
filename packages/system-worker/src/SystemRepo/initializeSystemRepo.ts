/*
 * System-worker annotation:
 * Implements the SystemRepo initialize System Repo operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDbConfig } from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';

import { makeDurableDb } from '../makeDurableDb.js';

export const initializeSystemRepo = Effect.fn('SystemRepo.initialize')(
  function* <CONFIG extends IDbConfig>(props: {
    storage: DurableObjectStorage;
    dbConfig: CONFIG;
  }) {
    const { dbConfig, storage } = props;

    const db = yield* Effect.sync(() =>
      makeDurableDb({
        storage,
        dbConfig,
      }),
    );

    return { db };
  },
);
