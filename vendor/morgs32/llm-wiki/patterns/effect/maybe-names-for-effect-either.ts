import { Effect, Either } from 'effect';

declare function getByKeyOrThrow(props: {
  record: Record<string, unknown>;
  key: string;
}): Effect.Effect<unknown, unknown, never>;

/**
 * Bindings after Effect.either use maybe* — the noun is the expected Right value.
 *
 * @bad Generic names like `accountContractResult` after `.pipe(Effect.either)`.
 * @bad maybe* prefix on a direct yield* without Effect.either.
 */
export const resolveContract = Effect.fn('resolveContract')(function* (props: {
  contracts: Record<string, unknown>;
  commandName: string;
}) {
  const maybeContract = yield* getByKeyOrThrow({
    record: props.contracts,
    key: props.commandName,
  }).pipe(Effect.either);

  if (Either.isLeft(maybeContract)) {
    return maybeContract.left;
  }
  return maybeContract.right;
});
