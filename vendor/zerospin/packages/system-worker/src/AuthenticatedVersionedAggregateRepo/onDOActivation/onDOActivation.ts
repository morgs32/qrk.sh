import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import config from 'config';
import { Effect } from 'effect';

import type { AuthenticatedVersionedAggregateRepo } from '../AuthenticatedVersionedAggregateRepo.js';
import { authenticatedVersionedAggregateRepoDbConfig } from '../authenticatedVersionedAggregateRepoDbConfig.js';

const { system } = config;

/** Initialize declared sources, then catch up and enroll without an execution permit. */
export const onDOActivation = Effect.fn(
  'AuthenticatedVersionedAggregateRepo.onDOActivation',
)(function* (props: {
  repo: Pick<
    AuthenticatedVersionedAggregateRepo,
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
      tx.insert(authenticatedVersionedAggregateRepoDbConfig.schema.services)
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
