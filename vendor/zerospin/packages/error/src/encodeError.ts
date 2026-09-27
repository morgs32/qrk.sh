import { Effect, Schema } from 'effect';

import type { IZerospinError } from './types.js';

export const ZerospinErrorJsonSchema = Schema.Struct({
  _tag: Schema.Literal('ZerospinError'),
  code: Schema.String,
  message: Schema.String,
  status: Schema.NullOr(Schema.Number),
  extra: Schema.NullOr(Schema.Record(Schema.String, Schema.Json)),
});
export type IZerospinErrorJson<CODE extends string = string> = Omit<
  typeof ZerospinErrorJsonSchema.Type,
  'code'
> & { readonly code: CODE };

const serializationFailure = {
  _tag: 'ZerospinError',
  code: 'error-serialization-failed',
  message: 'The error could not be serialized.',
  status: null,
  extra: null,
} as const;

export type ErrorJson<E> = E extends { toJson(): infer JSON }
  ? JSON | typeof serializationFailure
  : E extends Pick<
        IZerospinError<infer CODE>,
        '_tag' | 'code' | 'message' | 'status' | 'extra'
      >
    ? IZerospinErrorJson<CODE> | typeof serializationFailure
    : typeof serializationFailure;

function frameworkExtra(
  value: unknown,
  ancestors = new Set<object>(),
): Schema.Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    throw new Error('Invalid public error extra');
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error('Public error extra must contain plain JSON values');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from(value, item => frameworkExtra(item, ancestors));
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'stack' && key !== 'cause')
        .map(([key, item]) => [key, frameworkExtra(item, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Serialize typed failures only; defects and interruption remain in the caller's Cause. */
export function encodeError<E>(error: E): Effect.Effect<ErrorJson<E>>;
export function encodeError(error: unknown) {
  return Effect.try(() => {
    if (typeof error !== 'object' || error === null) {
      throw new Error('Expected a framework or scoped business error');
    }
    if ('scope' in error) {
      if (!('toJson' in error) || typeof error.toJson !== 'function') {
        throw new Error('A scoped business error requires its declared codec');
      }
      return Schema.decodeUnknownSync(Schema.Json)(error.toJson());
    }
    const framework = Schema.decodeUnknownSync(
      Schema.Struct({
        ...ZerospinErrorJsonSchema.fields,
        extra: Schema.Unknown,
      }),
    )(error);
    return Schema.decodeUnknownSync(ZerospinErrorJsonSchema)({
      _tag: 'ZerospinError' as const,
      code: framework.code,
      message: framework.message,
      status: framework.status,
      extra: frameworkExtra(framework.extra),
    });
  }).pipe(
    Effect.catch(cause =>
      Effect.logError('Error serialization failed', error, cause).pipe(
        Effect.as(serializationFailure),
      ),
    ),
  );
}
