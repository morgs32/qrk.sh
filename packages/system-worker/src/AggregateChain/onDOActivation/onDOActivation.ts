import type { IDb } from '@zerospin/core/drizzle/types';
import { catchZerospinError } from '@zerospin/error';
import config from 'config';
import { Effect } from 'effect';

import { AggregateVersionRepo } from '../../AggregateVersionRepo/AggregateVersionRepo.js';
import type { IAlarmRegistry } from '../../makeAlarmRegistry/makeAlarmRegistry.js';
import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

const { system } = config;

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
          const aggregateVersionRepoName =
            yield* AggregateVersionRepo.fixedDORepoConfig.nameUtils.makeName({
              ...props.key,
              aggregateVersion,
            });
          return { aggregateVersionRepoName, aggregateVersion };
        }),
    );
    yield* props.alarms.hold('admissionResultsFanout');
    yield* Effect.try({
      try: () =>
        props.db.transaction(tx => {
          tx.update(aggregateChainDbConfig.schema.aggregateVersionRepos)
            .set({ active: false })
            .run();
          for (const destination of destinations) {
            tx.insert(aggregateChainDbConfig.schema.aggregateVersionRepos)
              .values({
                ...destination,
                active: true,
                currentIndex: null,
                failure: null,
              })
              .onConflictDoUpdate({
                target:
                  aggregateChainDbConfig.schema.aggregateVersionRepos
                    .aggregateVersionRepoName,
                set: { active: true },
              })
              .run();
          }
        }),
      catch: catchZerospinError({
        code: 'aggregate-membership-reconciliation-failed',
      }),
    });
  },
);
