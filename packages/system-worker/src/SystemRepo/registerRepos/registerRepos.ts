/*
 * System-worker annotation:
 * Publishes one ready definition projection and actor-command chain together.
 */
import type { IDb } from '@zerospin/core/drizzle/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import type { AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

import { registerReposTx } from './registerReposTx.js';

/*
 * Session initialization registers its projection and retained output log
 * as one catalog transaction. The pair must belong to the same aggregate or
 * service definition topology.
 *
 * 1. Require a matching projection/log pair.
 * 2. Open one catalog registration transaction.
 * 3. Register the definition materializer.
 * 4. Register the retained definition log.
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
    sessionRepo: {
      repoType: 'AggregateActorVersionRepo' | 'ServiceActorVersionRepo';
      repoName: string;
      tableNames: readonly string[];
    };
    finalizedCommandChain: {
      repoType: 'AggregateActorVersionChain' | 'ServiceActorVersionChain';
      repoName: string;
      tableNames: readonly string[];
    };
  }) {
    const { db, finalizedCommandChain, sessionRepo, repoTable, spec } = props;

    // 1 — reject aggregate/service Repo-kind mismatches before the transaction
    if (
      (sessionRepo.repoType === 'AggregateActorVersionRepo' &&
        finalizedCommandChain.repoType !== 'AggregateActorVersionChain') ||
      (sessionRepo.repoType === 'ServiceActorVersionRepo' &&
        finalizedCommandChain.repoType !== 'ServiceActorVersionChain')
    ) {
      return yield* Effect.die(
        'SystemRepo.registerRepos requires a matching projection/actor-command chain pair',
      );
    }

    // 2 — commit both registrations together
    yield* registerReposTx(db, {
      spec,
      repoTable,
      sessionRepo,
      finalizedCommandChain,
    });
  },
);
