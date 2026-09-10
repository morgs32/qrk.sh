import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

import type { IAlarmRegistry } from '../../makeAlarmRegistry/makeAlarmRegistry.js';
import { VersionedAggregateRepo } from '../../VersionedAggregateRepo/VersionedAggregateRepo.js';
import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

/** Reconcile deployed membership, preserving retained cursors and failure state. */
export const onDOActivation = Effect.fn('AggregateChain.onDOActivation')(
  function* (props: {
    db: IDb;
    key: { systemId: string; aggregateId: string; aggregateName: string };
    alarms: IAlarmRegistry;
  }) {
    const versions = system.aggregates[props.key.aggregateName] ?? {};
    const destinations = yield* Effect.forEach(
      Object.keys(versions),
      aggregateVersion =>
        Effect.gen(function* () {
          const versionedAggregateRepoName =
            yield* VersionedAggregateRepo.fixedDORepoConfig.nameUtils.makeName({
              ...props.key,
              aggregateVersion,
            });
          return { versionedAggregateRepoName, aggregateVersion };
        }),
    );
    yield* props.alarms.hold('versionedAggregateFanoutQueue');
    yield* Effect.try({
      try: () =>
        props.db.transaction(tx => {
          tx.update(aggregateChainDbConfig.schema.versionedAggregateRepos)
            .set({ active: false })
            .run();
          for (const destination of destinations) {
            tx.insert(aggregateChainDbConfig.schema.versionedAggregateRepos)
              .values({
                ...destination,
                active: true,
                currentIndex: null,
                failure: null,
              })
              .onConflictDoUpdate({
                target:
                  aggregateChainDbConfig.schema.versionedAggregateRepos
                    .versionedAggregateRepoName,
                set: { active: true },
              })
              .run();
          }
        }),
      catch: ZerospinError.catch({
        code: 'aggregate-membership-reconciliation-failed',
      }),
    });
  },
);
