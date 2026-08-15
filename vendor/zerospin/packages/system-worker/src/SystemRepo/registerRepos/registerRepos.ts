/*
 * System-worker annotation:
 * Publishes one ready frontend projection and its archive together.
 */

import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import type { AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

import { registerRepo } from '../registerRepo/registerRepo.js';

export const registerRepos = Effect.fn('SystemRepo.registerRepos')(
  function* (props: {
    db: IDb;
    generationId: string;
    repoTable: IAnyDrizzleSchema & {
      generationId: AnyColumn;
      repoType: AnyColumn;
      repoName: AnyColumn;
      tableNames: AnyColumn;
    };
    frontendRepo: {
      repoType: 'AggregateFrontendRepo' | 'ServiceFrontendRepo';
      repoName: string;
      tableNames: readonly string[];
    };
    frontendBlockRepo: {
      repoType: 'AggregateFrontendBlockRepo' | 'ServiceFrontendBlockRepo';
      repoName: string;
      tableNames: readonly string[];
    };
  }) {
    const { db, frontendBlockRepo, frontendRepo, generationId, repoTable } =
      props;
    if (
      (frontendRepo.repoType === 'AggregateFrontendRepo' &&
        frontendBlockRepo.repoType !== 'AggregateFrontendBlockRepo') ||
      (frontendRepo.repoType === 'ServiceFrontendRepo' &&
        frontendBlockRepo.repoType !== 'ServiceFrontendBlockRepo')
    ) {
      return yield* Effect.die(
        'SystemRepo.registerRepos requires a matching projection/archive pair',
      );
    }

    yield* makeTx({
      db,
      program: Effect.fn('SystemRepo.registerRepos.transaction')(function* ({
        tx,
      }) {
        yield* registerRepo({
          db: tx,
          repoTable,
          registration: {
            generationId,
            repoType: frontendRepo.repoType,
            repoName: frontendRepo.repoName,
            tableNames: frontendRepo.tableNames,
          },
        });

        yield* registerRepo({
          db: tx,
          repoTable,
          registration: {
            generationId,
            repoType: frontendBlockRepo.repoType,
            repoName: frontendBlockRepo.repoName,
            tableNames: frontendBlockRepo.tableNames,
          },
        });
      }),
    });
  },
);
