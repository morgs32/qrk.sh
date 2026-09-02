/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types / defaults */

import type { IAnyError, IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import type { Effect } from 'effect';

import type { Async } from '../async/Async.ts';

// --- base ---

export type IAnyRecord = {
  readonly [key: string]: any;
};

export type Prettify<T> = {
  [KEY in keyof T]: T[KEY];
} & {};

/** First parameter of a function (typically the props object). */
export type InferProps<FN extends (...args: never) => unknown> =
  Parameters<FN>[0];

type IRpcMethodKeys<T> = {
  [K in keyof T]: K extends string
    ? T[K] extends (...args: never) => unknown
      ? K
      : never
    : never;
}[keyof T];

/** Every function member must return `Promise<IEncodedResult<…>>`; violations become `ITypeError`. */
type IRpcTargetMethodsOf<T> = {
  [K in IRpcMethodKeys<T>]: T[K] extends (...args: infer A) => infer R
    ? Awaited<R> extends IEncodedResult<infer S, infer E extends IAnyErrorJson>
      ? (...args: A) => Promise<IEncodedResult<S, E>>
      : ITypeError<`RPC method "${K & string}" must return Promise<IEncodedResult<…>>`>
    : never;
};

/**
 * Leaf Capnweb / DO RPC surface — every public method resolves to a wire-encoded Result,
 * not a thrown domain error (see `$engineering-patterns` RPC guidance).
 */
export type IRpcTarget<T> = Prettify<IRpcTargetMethodsOf<T>>;

/** Extra `RequestInit` for capnweb `newHttpBatchRpcSession(new Request(url, init))` (e.g. Clerk `Authorization`). */
export type IApiRequestInit = {
  readonly getRequestInit: () => RequestInit | Promise<RequestInit>;
};

export type ISignatureFactory<T extends IAnyRecord = IAnyRecord> =
  () => Effect.Effect<T, IAnyError, Async>;

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
