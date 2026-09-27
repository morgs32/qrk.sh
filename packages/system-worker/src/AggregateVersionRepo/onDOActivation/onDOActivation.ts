import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import type { AggregateVersionRepo } from '../AggregateVersionRepo.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';

const { system } = config;

/** Initialize the execution head and sources after common spec acceptance, then catch up and enroll. */
export const onDOActivation = Effect.fn('AggregateVersionRepo.onDOActivation')(
  function* (props: {
    repo: Pick<
      AggregateVersionRepo,
      'db' | 'key' | 'serviceResultsToAggregatesFanoutSubscriber'
    >;
  }) {
    const { repo } = props;
    const latest = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: repo.key.aggregateName,
      recordKind: 'aggregates',
    });
    const aggregate = yield* getByKeyOrThrow({
      record: latest,
      key: repo.key.aggregateVersion,
      recordKind: 'listed versions',
    });
    const head = repo.db
      .select()
      .from(aggregateVersionRepoDbConfig.schema.head)
      .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
      .get();
    if (!head) {
      // Retain execution-head initialization even if source subscription later fails.
      repo.db
        .insert(aggregateVersionRepoDbConfig.schema.head)
        .values({
          singletonId: 1,
          aggregateIndex: 0,
          executedIndex: 0,
          dispositionHash: genesisDispositionHash(),
        })
        .run();
    }
    // Dependencies belong to the authored snapshot; resource enrollment is independent.
    repo.db.transaction(tx => {
      for (const serviceName of Object.keys(aggregate.services)) {
        tx.insert(aggregateVersionRepoDbConfig.schema.services)
          .values({
            serviceName,
            lastIndex: 0,
          })
          .onConflictDoNothing()
          .run();
      }
    });
    // Remote paging must not retain the execution permit used by local receipt.
    for (const [serviceName, serviceVersion] of Object.entries(
      aggregate.services,
    )) {
      const subscriber = repo.serviceResultsToAggregatesFanoutSubscriber({
        systemId: repo.key.systemId,
        serviceName,
        serviceVersion,
      });
      yield* makeAsync(() => subscriber.subscribe()).pipe(
        Effect.flatMap(envelope => readRpcEnvelope(envelope)),
      );
    }
  },
);
