/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types / defaults */

import type { IAnyError, IAnyErrorJson } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type { Async } from '../async/Async.ts';

// --- base ---

/** Compile-time-only error brand for generic constraints (`@ts-expect-error CoreTypeError`). */
export type ITypeError<T extends string> = {
  name: 'CoreTypeError';
  type: T;
};

export type IAnyRecord = {
  readonly [key: string]: any;
};

export type Prettify<T> = {
  [KEY in keyof T]: T[KEY];
} & {};

/** First parameter of a function (typically the props object). */
export type InferProps<FN extends (...args: never) => unknown> =
  Parameters<FN>[0];

/** Wire return type for a stub-invokable RPC method (`encodeRpc` / `decodeRpc`). */
export type IRpcEitherEncoded<
  SUCCESS = unknown,
  ERROR_JSON extends IAnyErrorJson = IAnyErrorJson,
> = Promise<Schema.EitherEncoded<SUCCESS, ERROR_JSON>>;

type IRpcMethodKeys<T> = {
  [K in keyof T]: K extends string
    ? T[K] extends (...args: never) => unknown
      ? K
      : never
    : never;
}[keyof T];

/** Every function member must return `Promise<Schema.EitherEncoded<…>>`; violations become `ITypeError`. */
type IRpcTargetMethodsOf<T> = {
  [K in IRpcMethodKeys<T>]: T[K] extends (...args: infer A) => infer R
    ? Awaited<R> extends Schema.EitherEncoded<
        infer S,
        infer E extends IAnyErrorJson
      >
      ? (...args: A) => Promise<Schema.EitherEncoded<S, E>>
      : ITypeError<`RPC method "${K & string}" must return Promise<Schema.EitherEncoded<…>>`>
    : never;
};

/**
 * Leaf Capnweb / DO RPC surface — every public method resolves to wire-encoded Either,
 * not a thrown domain error (see vendor/morgs32/llm-wiki/patterns/rpc/).
 */
export type IRpcTarget<T> = Prettify<IRpcTargetMethodsOf<T>>;

/** Extra `RequestInit` for capnweb `newHttpBatchRpcSession(new Request(url, init))` (e.g. Clerk `Authorization`). */
export type IApiRequestInit = {
  readonly getRequestInit: () => RequestInit | Promise<RequestInit>;
};

export type ISignatureFactory<T extends IAnyRecord = IAnyRecord> =
  () => Effect.Effect<T, IAnyError, Async>;

export type ICuidFactory = () => Effect.Effect<string>;

/** Raw monotonic opaque suffix (e.g. ULID). No prefix — use `makeCursor` for full cursor ids. */
export type IMonotonicFactory = () => Effect.Effect<string>;

export type IPosthog = {
  capture: (props: {
    event: string;
    properties?: Record<string, unknown>;
    distinctId?: string;
  }) => Effect.Effect<void, IAnyError>;

  identify: (props: {
    distinctId: string;
    properties?: Record<string, unknown>;
  }) => Effect.Effect<void, IAnyError>;

  flush: () => Effect.Effect<void, IAnyError>;
};
