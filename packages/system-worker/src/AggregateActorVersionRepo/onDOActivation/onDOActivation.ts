import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { Effect } from 'effect';

import type { AggregateActorVersionRepo } from '../AggregateActorVersionRepo.js';

/** The selected replica subscribes only to VAR's ordered output. */
export const onDOActivation = Effect.fn(
  'AggregateActorVersionRepo.onDOActivation',
)(function* (props: {
  repo: Pick<
    AggregateActorVersionRepo,
    'key' | 'executionResultsFanoutSubscriber'
  >;
}) {
  yield* makeAsync(() =>
    props.repo.executionResultsFanoutSubscriber(props.repo.key).subscribe(),
  ).pipe(Effect.flatMap(readRpcEnvelope));
});
