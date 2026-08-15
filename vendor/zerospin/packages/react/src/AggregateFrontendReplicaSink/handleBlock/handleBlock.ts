import type { IAggregateFrontendReplicaBlock } from '@zerospin/core/session/types';
import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';

export const handleBlock = Effect.fn(
  'AggregateFrontendReplicaSink.handleBlock',
)(function* (props: {
  frontendReplicaBlock: IAggregateFrontendReplicaBlock;
  invoke(
    frontendReplicaBlock: IAggregateFrontendReplicaBlock,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}) {
  return yield* Effect.promise(() => props.invoke(props.frontendReplicaBlock));
});
