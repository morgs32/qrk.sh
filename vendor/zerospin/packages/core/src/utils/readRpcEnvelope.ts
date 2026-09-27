import {
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinError,
} from '@zerospin/error';
import {
  TelemetryBatchSchema,
  TelemetryCollector,
  type ITelemetryBatch,
} from '@zerospin/logger';
import { Effect, Option, Schema } from 'effect';

/** Consume the domain result only after merging the remote diagnostic batch. */
export const readRpcEnvelope = Effect.fn('readRpcEnvelope')(function* <
  A,
  E = IAnyError,
>(
  envelope: Readonly<{ result: IResult<A, E>; telemetry: ITelemetryBatch }>,
): Effect.fn.Return<A, E | IZerospinError<'rpc-envelope-invalid'>> {
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    !('telemetry' in envelope) ||
    !('result' in envelope) ||
    !Schema.is(TelemetryBatchSchema)(envelope.telemetry) ||
    typeof envelope.result !== 'object' ||
    envelope.result === null ||
    !('_tag' in envelope.result) ||
    (envelope.result._tag !== 'Success' &&
      envelope.result._tag !== 'Failure') ||
    (envelope.result._tag === 'Success'
      ? !('success' in envelope.result)
      : !('failure' in envelope.result))
  ) {
    return yield* Effect.fail(makeZerospinError('rpc-envelope-invalid'));
  }
  const collector = yield* Effect.serviceOption(TelemetryCollector);
  if (Option.isSome(collector)) collector.value.merge(envelope.telemetry);
  return yield* envelope.result._tag === 'Failure'
    ? Effect.fail(envelope.result.failure)
    : Effect.succeed(envelope.result.success);
});
