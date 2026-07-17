import { Effect, ParseResult } from 'effect';

import { ZerospinError } from './ZerospinError.js';

interface IProps<CODE extends string> {
  readonly code: CODE;
  readonly prefix: string;
  readonly extra?: null | Record<string, unknown>;
}

export function mapParseError<CODE extends string>(props: IProps<CODE>) {
  const { code, prefix, extra = null } = props;
  return <A, R>(self: Effect.Effect<A, ParseResult.ParseError, R>) =>
    self.pipe(
      Effect.mapError(
        error =>
          new ZerospinError({
            code,
            extra,
            message: `${prefix}: ${ParseResult.TreeFormatter.formatErrorSync(error)}`,
          }),
      ),
    );
}
