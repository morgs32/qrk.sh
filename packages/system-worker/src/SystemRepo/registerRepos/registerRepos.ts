/*
 * System-worker annotation:
 * Publishes the actor-specific service projection and its archive together.
 */

import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';

import { registerRepo } from '../registerRepo/registerRepo.js';

export const registerRepos = Effect.fn('SystemRepo.registerRepos')(
  function* (props: {
    db: IDb;
    repoTable: unknown;
    serviceFrontendRepo: {
      repoName: string;
      tableNames: readonly string[];
    };
    serviceFrontendBlockRepo: {
      repoName: string;
      tableNames: readonly string[];
    };
  }) {
    const { db, repoTable, serviceFrontendBlockRepo, serviceFrontendRepo } =
      props;

    yield* makeTx({
      db,
      program: Effect.fn('SystemRepo.registerRepos.transaction')(function* ({
        tx,
      }) {
        yield* registerRepo({
          db: tx,
          repoTable,
          registration: {
            repoType: 'ServiceFrontendRepo',
            repoName: serviceFrontendRepo.repoName,
            tableNames: serviceFrontendRepo.tableNames,
          },
        });

        yield* registerRepo({
          db: tx,
          repoTable,
          registration: {
            repoType: 'ServiceFrontendBlockRepo',
            repoName: serviceFrontendBlockRepo.repoName,
            tableNames: serviceFrontendBlockRepo.tableNames,
          },
        });
      }),
    });
  },
);
