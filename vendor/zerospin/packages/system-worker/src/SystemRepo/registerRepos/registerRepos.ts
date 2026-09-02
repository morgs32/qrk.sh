/*
 * System-worker annotation:
 * Publishes one ready frontend projection and finalized-command chain together.
 */

import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import type { AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

import { registerRepo } from '../registerRepo/registerRepo.js';

export const registerRepos = Effect.fn('SystemRepo.registerRepos')(
  function* (props: {
    db: IDb;
    repoTable: IAnyDrizzleSchema & {
      repoType: AnyColumn;
      repoName: AnyColumn;
      tableNames: AnyColumn;
    };
    frontendRepo: {
      repoType:
        | 'MaterializedAggregateFrontendRepo'
        | 'MaterializedServiceFrontendRepo';
      repoName: string;
      tableNames: readonly string[];
    };
    finalizedCommandChain: {
      repoType:
        | 'AggregateFrontendFinalizedCommandChain'
        | 'ServiceFrontendFinalizedCommandChain';
      repoName: string;
      tableNames: readonly string[];
    };
  }) {
    const { db, finalizedCommandChain, frontendRepo, repoTable } = props;
    if (
      (frontendRepo.repoType === 'MaterializedAggregateFrontendRepo' &&
        finalizedCommandChain.repoType !==
          'AggregateFrontendFinalizedCommandChain') ||
      (frontendRepo.repoType === 'MaterializedServiceFrontendRepo' &&
        finalizedCommandChain.repoType !==
          'ServiceFrontendFinalizedCommandChain')
    ) {
      return yield* Effect.die(
        'SystemRepo.registerRepos requires a matching projection/finalized-command chain pair',
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
            repoType: frontendRepo.repoType,
            repoName: frontendRepo.repoName,
            tableNames: frontendRepo.tableNames,
          },
        });

        yield* registerRepo({
          db: tx,
          repoTable,
          registration: {
            repoType: finalizedCommandChain.repoType,
            repoName: finalizedCommandChain.repoName,
            tableNames: finalizedCommandChain.tableNames,
          },
        });
      }),
    });
  },
);
