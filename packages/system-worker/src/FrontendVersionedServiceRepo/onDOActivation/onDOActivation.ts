import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect } from 'effect';

import type { FrontendVersionedServiceRepo } from '../FrontendVersionedServiceRepo.js';

/** Catch up and enroll the bound source before serving incoming events. */
export const onDOActivation = Effect.fn(
  'FrontendVersionedServiceRepo.onDOActivation',
)(function* (props: {
  repo: Pick<
    FrontendVersionedServiceRepo,
    'key' | 'replicaFanoutQueueSubscriber'
  >;
}) {
  const { repo } = props;
  yield* makeAsync(() =>
    repo.replicaFanoutQueueSubscriber(repo.key).subscribe(),
  ).pipe(Effect.flatMap(decodeRpc));
});
