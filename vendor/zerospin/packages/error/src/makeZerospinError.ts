import { Cause, Schema, SchemaGetter } from 'effect';
import { toStringUnknown } from 'effect/Inspectable';

import { ZerospinError } from './ScopedError.js';
import type { IAnyError, IZerospinError } from './types.js';

export const ZerospinErrorSchema = Schema.Struct({
  _tag: Schema.Literal('ZerospinError'),
  cause: Schema.NullOr(Schema.String),
  extra: Schema.Unknown,
  code: Schema.String,
  message: Schema.String,
  status: Schema.NullOr(Schema.Number),
}).pipe(
  Schema.decodeTo(
    Schema.declare<IAnyError>(
      (value): value is IAnyError => value instanceof ZerospinError,
    ),
    {
      decode: SchemaGetter.transform(props => new ZerospinError(props)),
      encode: SchemaGetter.transform(error => ({
        _tag: error._tag,
        code: error.code,
        message: error.message,
        status: error.status,
        cause: error.cause,
        extra: error.extra,
      })),
    },
  ),
);

export function makeZerospinError<const CODE extends string>(
  props:
    | CODE
    | {
        code: CODE;
        cause?: string | null;
        extra?: unknown;
        message?: string;
        status?: number | null;
      },
): IZerospinError<CODE> {
  const input = typeof props === 'string' ? { code: props } : props;
  return new ZerospinError(input);
}

export function makeZerospinErrorFactory<
  const CODE extends string,
>(definition: { code: CODE; message?: string }) {
  return (
    props: {
      cause?: string | null;
      extra?: unknown;
      message?: string;
      status?: number | null;
    } = {},
  ): IZerospinError<CODE> =>
    makeZerospinError({ ...definition, ...props, code: definition.code });
}

export const isZerospinError = Schema.is(ZerospinErrorSchema);

export function formatZerospinError(error: IAnyError): string {
  const message =
    error.message === error.code
      ? error.code
      : `${error.code}: ${error.message}`;
  return error.cause === null
    ? message
    : `${message}\nCaused by: ${error.cause}`;
}

/** Format causes before extracting their failure; preserve native failure stacks. */
export function prettyUnknownFailure(error: unknown): string {
  const text = Cause.isCause(error)
    ? Cause.pretty(error)
    : isZerospinError(error)
      ? formatZerospinError(error)
      : error instanceof Error
        ? (error.stack ?? `${error.name}: ${error.message}`)
        : typeof error === 'object' && error !== null
          ? toStringUnknown(error)
          : String(error);
  return text.length <= 8_000 ? text : `${text.slice(0, 8_000)}\n…[truncated]`;
}

export const isAsyncRunSyncFailure = (error: unknown): boolean =>
  prettyUnknownFailure(error).includes('AsyncFiberException');

export function catchZerospinError<CODE extends string>(props: {
  code: CODE;
  message?: string;
  preferCauseMessage?: boolean;
  extra?: unknown;
  status?: number | null;
}): (cause: unknown) => IZerospinError<CODE> {
  const {
    code,
    message = code,
    preferCauseMessage = true,
    extra,
    status,
  } = props;
  return cause =>
    makeZerospinError({
      code,
      message:
        preferCauseMessage && cause instanceof Error ? cause.message : message,
      cause: prettyUnknownFailure(cause),
      ...(extra !== undefined ? { extra } : {}),
      ...(status !== undefined ? { status } : {}),
    });
}

export const stringifyZerospinError = Schema.encodeSync(
  Schema.fromJsonString(ZerospinErrorSchema),
);
export const parseZerospinError = Schema.decodeSync(
  Schema.fromJsonString(ZerospinErrorSchema),
);
