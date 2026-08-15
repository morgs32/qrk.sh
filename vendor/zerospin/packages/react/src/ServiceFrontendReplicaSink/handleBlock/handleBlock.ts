import type { IServiceFrontendReplicaBlock } from '@zerospin/core/serviceSession/types';
import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';

export const handleBlock = Effect.fn('ServiceFrontendReplicaSink.handleBlock')(
  function* (props: {
    serviceFrontendReplicaBlock: IServiceFrontendReplicaBlock;
    invoke(
      serviceFrontendReplicaBlock: IServiceFrontendReplicaBlock,
    ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  }) {
    return yield* Effect.promise(() =>
      props.invoke(props.serviceFrontendReplicaBlock),
    );
  },
);
