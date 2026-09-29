import {
  encodeError,
  makeZerospinError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect, Schema, SchemaIssue } from 'effect';

const ResultSchema = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('Success'), success: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.Literal('Failure'), failure: Schema.Unknown }),
]);

export function decodeRpcOutcome<RESULT extends IResult>(
  result: RESULT,
): Effect.Effect<
  Extract<RESULT, { _tag: 'Success' }>['success'],
  | Extract<RESULT, { _tag: 'Failure' }>['failure']
  | IZerospinErrorJson<'result-invalid'>
>;
export function decodeRpcOutcome(result: IResult) {
  return Schema.decodeUnknownEffect(ResultSchema)(result).pipe(
    Effect.mapError(error =>
      makeZerospinError({
        code: 'result-invalid',
        message: 'Invalid result',
        cause: SchemaIssue.makeFormatterDefault()(error.issue),
      }),
    ),
    Effect.catch(error => encodeError(error).pipe(Effect.flatMap(Effect.fail))),
    Effect.flatMap(() =>
      result._tag === 'Failure'
        ? Effect.fail(result.failure)
        : Effect.succeed(result.success),
    ),
  );
}
