import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { Effect } from 'effect';

import type { ServiceActorVersionRepo } from '../ServiceActorVersionRepo.js';

/** Catch up and enroll the bound source before serving incoming events. */
export const onDOActivation = Effect.fn(
  'ServiceActorVersionRepo.onDOActivation',
)(function* (props: {
  repo: Pick<
    ServiceActorVersionRepo,
    'key' | 'executionResultsFanoutSubscriber'
  >;
}) {
  const { repo } = props;
  yield* makeAsync(() =>
    repo.executionResultsFanoutSubscriber(repo.key).subscribe(),
  ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
});
