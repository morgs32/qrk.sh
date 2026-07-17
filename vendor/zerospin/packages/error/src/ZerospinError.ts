import { Cause, Data, Runtime, Schema } from 'effect';
import { isObject } from 'effect/Predicate';

import type { IAnyError, IAnyErrorJson, IZerospinError } from './types.js';

const ZerospinErrorJsonSchema = Schema.Struct({
  cause: Schema.NullOr(Schema.String),
  extra: Schema.NullOr(
    Schema.Record({
      key: Schema.String,
      value: Schema.Unknown,
    }),
  ),
  code: Schema.String,
  message: Schema.String,
  status: Schema.NullOr(Schema.Number),
}) satisfies Schema.Schema<IAnyErrorJson>;

const maxCauseChars = 8_000;

const truncateCause = (text: string): string =>
  text.length <= maxCauseChars
    ? text
    : `${text.slice(0, maxCauseChars)}\n…[truncated]`;

const peelUnknown = (error: unknown): unknown =>
  Cause.isUnknownException(error) ? peelUnknown(error.error) : error;

const formatDisplayMessage = (code: string, rawMessage: string): string =>
  rawMessage === code ? code : `${code}: ${rawMessage}`;

export class ZerospinError<T extends string = never> extends Data.TaggedError(
  'ZerospinError',
)<IZerospinError<T>> {
  readonly #rawMessage: string;

  constructor(
    props:
      | T
      | {
          code: T;
          cause?: null | string;
          extra?: null | Record<string, unknown>;
          message?: string;
          status?: null | number;
        },
  ) {
    if (typeof props === 'string') {
      super({
        cause: null,
        code: props,
        extra: null,
        message: formatDisplayMessage(props, props),
        status: null,
      });
      this.#rawMessage = props;
    } else {
      const rawMessage = props.message ?? props.code;
      super({
        cause: props.cause ?? null,
        code: props.code,
        extra: props.extra ?? null,
        message: formatDisplayMessage(props.code, rawMessage),
        status: props.status ?? null,
      });
      this.#rawMessage = rawMessage;
    }
  }

  /** Human message for RPC JSON (no `code:` prefix). */
  get rawMessage(): string {
    return this.#rawMessage;
  }

  static isZerospinError(data: unknown): data is ZerospinError {
    return isObject(data) && '_tag' in data && data._tag === 'ZerospinError';
  }

  /** Unwrap tryPromise / FiberFailure failures and format with Effect's Cause.pretty. */
  static prettyUnknownFailure(error: unknown): string {
    const value = peelUnknown(error);
    if (Runtime.isFiberFailure(value)) {
      return truncateCause(Cause.pretty(value[Runtime.FiberFailureCauseId]));
    }
    if (Cause.isCause(value)) return truncateCause(Cause.pretty(value));
    if (value instanceof Error) {
      return truncateCause(value.stack ?? `${value.name}: ${value.message}`);
    }
    return truncateCause(String(value));
  }

  static isAsyncRunSyncFailure(error: unknown): boolean {
    return ZerospinError.prettyUnknownFailure(error).includes(
      'AsyncFiberException',
    );
  }

  /** Standard `Effect.try` / `Effect.tryPromise` catch callback. */
  static catch<T extends string>(props: {
    code: T;
    message?: string;
    preferCauseMessage?: boolean;
    extra?: Record<string, unknown> | null;
    status?: number | null;
  }): (cause: unknown) => ZerospinError<T> {
    const {
      code,
      message = code,
      preferCauseMessage = true,
      extra,
      status,
    } = props;
    return cause =>
      new ZerospinError({
        code,
        message:
          preferCauseMessage && cause instanceof Error
            ? cause.message
            : message,
        cause: ZerospinError.prettyUnknownFailure(cause),
        ...(extra !== undefined ? { extra } : {}),
        ...(status !== undefined ? { status } : {}),
      });
  }

  override toString(): string {
    const base = super.toString();
    const { cause } = this;
    if (cause === null) {
      return base;
    }
    return `${base}\nCaused by: ${cause}`;
  }

  static schema = Schema.transform(
    ZerospinErrorJsonSchema,
    Schema.declare((input: unknown): input is IAnyError =>
      ZerospinError.isZerospinError(input),
    ),
    {
      strict: true,
      decode: error => new ZerospinError(error),
      encode: error => {
        return {
          cause: error.cause,
          code: error.code,
          extra: error.extra,
          message: error.rawMessage,
          status: error.status,
        } satisfies IAnyErrorJson;
      },
    },
  ) as Schema.Schema<IAnyError, IAnyErrorJson>;

  static stringify(error: IAnyError): string {
    return Schema.encodeSync(Schema.parseJson(ZerospinError.schema))(error);
  }

  static parse(error: string): IAnyError {
    return Schema.decodeSync(Schema.parseJson(ZerospinError.schema))(error);
  }
}
