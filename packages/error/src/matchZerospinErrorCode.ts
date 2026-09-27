import { Result, Schema } from 'effect';

import { ZerospinError } from './ScopedError.js';

const recognizedFailure = Symbol('recognizedFailure');

class RecognizedError<Known extends ZerospinError> extends ZerospinError {
  readonly #wire: typeof PublicFailureSchema.Type;
  declare readonly scope?: 'contract' | 'actor' | 'aggregate';
  declare readonly [recognizedFailure]: Known | undefined;

  constructor(wire: typeof PublicFailureSchema.Type, known: Known | undefined) {
    super({ ...wire, extra: known === undefined ? wire.extra : known.extra });
    this.#wire = wire;
    if (wire.scope !== undefined) Object.assign(this, { scope: wire.scope });
    Object.defineProperty(this, recognizedFailure, { value: known });
  }

  toJson() {
    return this.#wire;
  }
}

export type IRecognizedFailure<Known extends ZerospinError> =
  RecognizedError<Known>;

export const PublicFailureSchema = Schema.Struct({
  _tag: Schema.Literal('ZerospinError'),
  code: Schema.String,
  scope: Schema.optionalKey(
    Schema.Literals(['contract', 'actor', 'aggregate']),
  ),
  message: Schema.String,
  status: Schema.NullOr(Schema.Number),
  extra: Schema.Json,
});

/** Recognize locally after transport. Never accept recognition metadata from the wire. */
export function recognizeZerospinError<Known extends ZerospinError>(
  codec: Schema.Codec<Known, unknown>,
  input: unknown,
): IRecognizedFailure<Known> {
  const wire = Schema.decodeUnknownSync(PublicFailureSchema, {
    onExcessProperty: 'error',
  })(input);
  const decoded = Schema.decodeUnknownResult(codec, {
    onExcessProperty: 'error',
  })(wire);
  const known = Result.isSuccess(decoded) ? decoded.success : undefined;
  return new RecognizedError(wire, known);
}

export function matchZerospinErrorCode<
  Known extends ZerospinError,
  Handlers extends {
    [Code in Known['code']]?: (
      error: Extract<Known, { readonly code: Code }>,
    ) => unknown;
  },
  Fallback,
>(props: {
  failure: IRecognizedFailure<Known>;
  onMatch: Handlers & {
    [Code in Exclude<keyof Handlers, Known['code']>]: never;
  };
  onUnknown: (
    error: ZerospinError & {
      readonly scope?: 'contract' | 'actor' | 'aggregate';
    },
  ) => Fallback;
}):
  | ReturnType<Extract<Handlers[keyof Handlers], (...args: never[]) => unknown>>
  | Fallback;
export function matchZerospinErrorCode(props: {
  failure: IRecognizedFailure<ZerospinError>;
  onMatch: Readonly<
    Record<string, ((error: ZerospinError) => unknown) | undefined>
  >;
  onUnknown: (error: ZerospinError) => unknown;
}): unknown {
  const known = props.failure[recognizedFailure];
  const handler =
    known === undefined || !Object.hasOwn(props.onMatch, known.code)
      ? undefined
      : props.onMatch[known.code];
  return handler === undefined || known === undefined
    ? props.onUnknown(props.failure)
    : handler(known);
}
