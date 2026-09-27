import { Effect, SchemaIssue, type Schema } from 'effect';

import { makeZerospinError } from './makeZerospinError.js';

interface IProps<CODE extends string> {
  readonly code: CODE;
  readonly prefix: string;
  readonly extra?: null | Record<string, unknown>;
}

export function mapParseError<CODE extends string>(props: IProps<CODE>) {
  const { code, prefix, extra = null } = props;
  return <A, R>(self: Effect.Effect<A, Schema.SchemaError, R>) =>
    self.pipe(
      Effect.mapError(error =>
        makeZerospinError({
          code,
          extra,
          message: `${prefix}: ${SchemaIssue.makeFormatterDefault()(error.issue)}`,
        }),
      ),
    );
}
