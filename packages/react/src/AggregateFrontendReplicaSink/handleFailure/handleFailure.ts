import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';

export const handleFailure = Effect.fn(
  'AggregateFrontendReplicaSink.handleFailure',
)(function* (props: {
  failure: IAnyErrorJson;
  invoke(
    failure: IAnyErrorJson,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
}) {
  return yield* Effect.promise(() => props.invoke(props.failure));
});
