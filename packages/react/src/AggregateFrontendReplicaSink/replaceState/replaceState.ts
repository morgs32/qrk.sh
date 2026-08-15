import type { IAggregateFrontendReplicaState } from '@zerospin/core/session/types';
import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';

export const replaceState = Effect.fn(
  'AggregateFrontendReplicaSink.replaceState',
)(function* (props: {
  frontendReplicaState: IAggregateFrontendReplicaState;
  invoke(
    frontendReplicaState: IAggregateFrontendReplicaState,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}) {
  return yield* Effect.promise(() => props.invoke(props.frontendReplicaState));
});
