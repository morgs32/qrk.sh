import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { Effect } from 'effect';
import { system } from 'system';

import type { UserVersionedAggregateRepo } from '../UserVersionedAggregateRepo.js';
import { userVersionedAggregateRepoDbConfig } from '../userVersionedAggregateRepoDbConfig.js';

/** Initialize declared sources, then catch up and enroll without an execution permit. */
export const onDOActivation = Effect.fn(
  'UserVersionedAggregateRepo.onDOActivation',
)(function* (props: {
  repo: Pick<
    UserVersionedAggregateRepo,
    | 'db'
    | 'key'
    | 'aggregateReplicaFanoutQueueSubscriber'
    | 'replicaFanoutQueueSubscriber'
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
  // Dependencies belong to the authored snapshot; resource enrollment is independent.
  repo.db.transaction(tx => {
    for (const serviceName of Object.keys(aggregate.services)) {
      tx.insert(userVersionedAggregateRepoDbConfig.schema.services)
        .values({
          serviceName,
          lastIndex: 0,
        })
        .onConflictDoNothing()
        .run();
    }
  });
  // Remote paging must not retain the execution permit used by local receipt.
  yield* makeAsync(() =>
    repo.replicaFanoutQueueSubscriber(repo.key).subscribe(),
  ).pipe(Effect.flatMap(decodeRpc));
  for (const [serviceName, serviceVersion] of Object.entries(
    aggregate.services,
  )) {
    const subscriber = repo.aggregateReplicaFanoutQueueSubscriber({
      systemId: repo.key.systemId,
      serviceName,
      serviceVersion,
    });
    yield* makeAsync(() => subscriber.subscribe()).pipe(
      Effect.flatMap(decodeRpc),
    );
  }
});
