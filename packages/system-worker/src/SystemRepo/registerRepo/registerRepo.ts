/*
 * System-worker annotation:
 * Registers one concrete Durable Object repo and its local SQLite tables.
 */

import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import type { IRepoRegistration } from '@zerospin/core/system/types';
import type { AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

export const registerRepo = Effect.fn('SystemRepo.registerRepo')(
  function* (props: {
    db: IDb | ITx;
    repoTable: IAnyDrizzleSchema & {
      generationId: AnyColumn;
      repoType: AnyColumn;
      repoName: AnyColumn;
      tableNames: AnyColumn;
    };
    registration: IRepoRegistration;
  }) {
    const { db, registration, repoTable } = props;
    yield* Effect.void;
    db.insert(repoTable)
      .values({
        ...registration,
        tableNames: JSON.stringify(registration.tableNames),
      })
      .onConflictDoUpdate({
        target: [
          repoTable.generationId,
          repoTable.repoType,
          repoTable.repoName,
        ],
        set: { tableNames: JSON.stringify(registration.tableNames) },
      })
      .run();
  },
);
