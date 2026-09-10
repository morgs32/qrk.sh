import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { system } from 'system';

import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import type { VersionedAggregateRepo } from '../VersionedAggregateRepo.js';
import { versionedAggregateRepoDbConfig } from '../versionedAggregateRepoDbConfig.js';

/** Initialize the execution head and sources after common spec acceptance, then catch up and enroll. */
export const onDOActivation = Effect.fn(
  'VersionedAggregateRepo.onDOActivation',
)(function* (props: {
  repo: Pick<
    VersionedAggregateRepo,
    'db' | 'key' | 'aggregateFanoutQueueSubscriber'
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
    .from(versionedAggregateRepoDbConfig.schema.head)
    .where(eq(versionedAggregateRepoDbConfig.schema.head.singletonId, 1))
    .get();
  if (!head) {
    // Retain execution-head initialization even if source subscription later fails.
    repo.db
      .insert(versionedAggregateRepoDbConfig.schema.head)
      .values({
        singletonId: 1,
        aggregateIndex: 0,
        dispositionHash: genesisDispositionHash(),
      })
      .run();
  }
  // Dependencies belong to the authored snapshot; resource enrollment is independent.
  repo.db.transaction(tx => {
    for (const serviceName of Object.keys(aggregate.services)) {
      tx.insert(versionedAggregateRepoDbConfig.schema.services)
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
    const subscriber = repo.aggregateFanoutQueueSubscriber({
      systemId: repo.key.systemId,
      serviceName,
      serviceVersion,
    });
    yield* makeAsync(() => subscriber.subscribe()).pipe(
      Effect.flatMap(decodeRpc),
    );
  }
});
