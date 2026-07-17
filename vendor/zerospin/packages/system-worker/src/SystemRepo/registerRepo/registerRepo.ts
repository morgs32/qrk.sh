/*
 * System-worker annotation:
 * Registers one concrete Durable Object repo and its local SQLite tables.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IRepoRegistration } from '@zerospin/core/system/types';
import { Effect } from 'effect';

export const registerRepo = Effect.fn('SystemRepo.registerRepo')(
  function* (props: {
    db: IDb;
    repoTable: unknown;
    registration: IRepoRegistration;
  }) {
    const { db, registration, repoTable } = props;
    yield* Effect.void;
    db.insert(repoTable as never)
      .values({
        ...registration,
        tableNames: JSON.stringify(registration.tableNames),
      } as never)
      .onConflictDoUpdate({
        target: [
          (repoTable as { repoType: unknown }).repoType,
          (repoTable as { repoName: unknown }).repoName,
        ] as never,
        set: { tableNames: JSON.stringify(registration.tableNames) } as never,
      })
      .run();
  },
);
