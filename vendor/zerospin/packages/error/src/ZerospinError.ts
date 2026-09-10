import { Cause, Data, Schema, SchemaTransformation } from 'effect';
import { isObject } from 'effect/Predicate';

import type { IAnyError, IAnyErrorJson, IZerospinError } from './types.js';

const ZerospinErrorJsonSchema = Schema.Struct({
  cause: Schema.NullOr(Schema.String),
  extra: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  code: Schema.String,
  message: Schema.String,
  status: Schema.NullOr(Schema.Number),
}) satisfies Schema.Schema<IAnyErrorJson>;

const maxCauseChars = 8_000;

const truncateCause = (text: string): string =>
  text.length <= maxCauseChars
    ? text
    : `${text.slice(0, maxCauseChars)}\n…[truncated]`;

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
      const { cause, code, extra, message, status } = props;
      const rawMessage = message ?? code;
      super({
        cause: cause ?? null,
        code,
        extra: extra ?? null,
        message: formatDisplayMessage(code, rawMessage),
        status: status ?? null,
      });
      this.#rawMessage = rawMessage;
    }
  }

  /** Human message for RPC JSON (no `code:` prefix). */
  get rawMessage(): string {
    return this.#rawMessage;
  }

  /** Define a fixed-code subclass with an optional default message. */
  static makeClass<const TCode extends string>(definition: {
    code: TCode;
    message?: string;
  }): new (props?: {
    code?: never;
    cause?: null | string;
    extra?: null | Record<string, unknown>;
    message?: string;
    status?: null | number;
  }) => ZerospinError<TCode> {
    const { code, message } = definition;

    return class extends ZerospinError<TCode> {
      constructor(
        props: {
          code?: never;
          cause?: null | string;
          extra?: null | Record<string, unknown>;
          message?: string;
          status?: null | number;
        } = {},
      ) {
        const { message: messageOverride } = props;
        super({
          ...props,
          code,
          message: messageOverride ?? message ?? code,
        });
      }
    };
  }

  static isZerospinError(data: unknown): data is ZerospinError {
    return isObject(data) && '_tag' in data && data._tag === 'ZerospinError';
  }

  /** Format Effect causes and Promise rejections without serializing fiber state. */
  static prettyUnknownFailure(error: unknown): string {
    if (Cause.isCause(error)) return truncateCause(Cause.pretty(error));
    if (error instanceof Error) {
      return truncateCause(error.stack ?? `${error.name}: ${error.message}`);
    }
    return truncateCause(String(error));
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

  static schema: Schema.Codec<IAnyError, IAnyErrorJson> =
    ZerospinErrorJsonSchema.pipe(
      Schema.decodeTo(
        Schema.declare<IAnyError>((input: unknown): input is IAnyError =>
          ZerospinError.isZerospinError(input),
        ),
        SchemaTransformation.transform({
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
        }),
      ),
    );

  static stringify(error: IAnyError): string {
    return Schema.encodeSync(Schema.fromJsonString(ZerospinError.schema))(
      error,
    );
  }

  static parse(error: string): IAnyError {
    return Schema.decodeSync(Schema.fromJsonString(ZerospinError.schema))(
      error,
    );
  }
}
