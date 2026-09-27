/**
 * Use `make*`, not `to*`, when naming helpers that construct or wrap a value.
 * Use encode/decode for actual boundary conversions: the spec 005 outcome
 * helpers are encodeRpcOutcome and decodeRpcOutcome, not makeRpcResult.
 *
 * @bad Introduce `to*` names for locally authored construction or wrapping helpers.
 * @bad Force make* onto explicitly named serialization/deserialization operations.
 */
export function makeSuccess<T>(success: T) {
  return { _tag: 'Success' as const, success };
}
