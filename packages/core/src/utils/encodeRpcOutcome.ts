import { encodeError, type ErrorJson, type IResult } from '@zerospin/error';
import { Effect } from 'effect';

export function encodeRpcOutcome<A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<IResult<A, ErrorJson<E>>, never, R> {
  return program.pipe(
    Effect.matchEffect({
      onFailure: failure =>
        encodeError(failure).pipe(
          Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
        ),
      onSuccess: success =>
        Effect.succeed({ _tag: 'Success' as const, success }),
    }),
  );
}
