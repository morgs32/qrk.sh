import type { IServiceFrontendReplicaState } from '@zerospin/core/serviceSession/types';
import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';

export const replaceState = Effect.fn(
  'ServiceFrontendReplicaSink.replaceState',
)(function* (props: {
  serviceFrontendReplicaState: IServiceFrontendReplicaState;
  invoke(
    serviceFrontendReplicaState: IServiceFrontendReplicaState,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}) {
  return yield* Effect.promise(() =>
    props.invoke(props.serviceFrontendReplicaState),
  );
});
