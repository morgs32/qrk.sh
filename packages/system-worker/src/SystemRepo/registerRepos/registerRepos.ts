/*
 * System-worker annotation:
 * Publishes one ready frontend projection and finalized-command chain together.
 */
import type { IDb } from '@zerospin/core/drizzle/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import type { AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

import { SystemRepoDb } from '../systemRepoDbConfig.js';

import { registerReposTx } from './registerReposTx.js';

/*
 * Frontend initialization registers its projection and retained output log
 * as one catalog transaction. The pair must belong to the same aggregate or
 * service frontend topology.
 *
 * 1. Require a matching projection/log pair.
 * 2. Open one catalog registration transaction.
 * 3. Register the frontend materializer.
 * 4. Register the retained frontend log.
 */
export const registerRepos = Effect.fn('SystemRepo.registerRepos')(
  function* (props: {
    db: IDb;
    spec: ISystemSpec;
    repoTable: IAnyDrizzleSchema & {
      repoType: AnyColumn;
      repoName: AnyColumn;
      tableNames: AnyColumn;
    };
    frontendRepo: {
      repoType: 'UserVersionedAggregateRepo' | 'FrontendVersionedServiceRepo';
      repoName: string;
      tableNames: readonly string[];
    };
    finalizedCommandChain: {
      repoType: 'UserVersionedAggregateChain' | 'FrontendServiceChain';
      repoName: string;
      tableNames: readonly string[];
    };
  }) {
    const { db, finalizedCommandChain, frontendRepo, repoTable } = props;

    // 1 — reject aggregate/service Repo-kind mismatches before the transaction
    if (
      (frontendRepo.repoType === 'UserVersionedAggregateRepo' &&
        finalizedCommandChain.repoType !== 'UserVersionedAggregateChain') ||
      (frontendRepo.repoType === 'FrontendVersionedServiceRepo' &&
        finalizedCommandChain.repoType !== 'FrontendServiceChain')
    ) {
      return yield* Effect.die(
        'SystemRepo.registerRepos requires a matching projection/finalized-command chain pair',
      );
    }

    // 2 — commit both registrations together
    yield* registerReposTx({
      spec: props.spec,
      repoTable,
      frontendRepo,
      finalizedCommandChain,
    }).pipe(Effect.provideService(SystemRepoDb, db));
  },
);
