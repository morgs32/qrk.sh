declare module 'effect' {
  export namespace Effect {
    type YieldWrap<E> = E;
    function fn<Name extends string>(
      name: Name,
    ): {
      <A, E, R>(
        fn: (
          props: any,
        ) => Generator<YieldWrap<Effect<any, any, any>>, A, never>,
      ): (props: any) => Effect<A, E, R>;
      <A, E, R>(
        fn: () => Generator<YieldWrap<Effect<any, any, any>>, A, never>,
      ): () => Effect<A, E, R>;
    };
    function gen<A, E, R>(
      fn: () => Generator<YieldWrap<Effect<any, any, any>>, A, never>,
    ): Effect<A, E, R>;
    function promise<A>(fn: () => Promise<A>): Effect<A, unknown, never>;
    function either<A, E, R>(
      effect: Effect<A, E, R>,
    ): Effect<
      { _tag: 'Right'; right: A } | { _tag: 'Left'; left: E },
      never,
      R
    >;
    function partition<A, E, R>(
      items: readonly unknown[],
      fn: (item: unknown) => Effect<A, E, R>,
    ): Effect<[E[], A[]], never, R>;
    function catchAll<A, E, R, E2>(
      effect: Effect<A, E, R>,
      fn: (e: E) => Effect<A, E2, R>,
    ): Effect<A, E2, R>;
    function provide<A, E, R, R2>(
      effect: Effect<A, E, R>,
      layer: unknown,
    ): Effect<A, E, R2>;
    function runPromise<A, E>(effect: Effect<A, E, never>): Promise<A>;
    function mapError<A, E, R, E2>(
      effect: Effect<A, E, R>,
      fn: (e: E) => E2,
    ): Effect<A, E2, R>;
    function flatMap<A, E, R, B, E2, R2>(
      effect: Effect<A, E, R>,
      fn: (a: A) => Effect<B, E2, R2>,
    ): Effect<B, E | E2, R | R2>;
    function all<A>(input: A): Effect<unknown, unknown, unknown>;
    function succeed<A>(value: A): Effect<A, never, never>;
    const void_: Effect<void, never, never>;
  }
  export namespace Either {
    function isLeft<E, A>(
      either: { _tag: 'Left'; left: E } | { _tag: 'Right'; right: A },
    ): either is { _tag: 'Left'; left: E };
  }
  export namespace Layer {
    function mergeAll(...layers: unknown[]): unknown;
  }
  export class ManagedRuntime<R> {
    static make<R>(layer: unknown): ManagedRuntime<R>;
    runPromise<A, E>(effect: Effect.Effect<A, E, R>): Promise<A>;
  }
  export const Effect: typeof Effect;
  export const Either: typeof Either;
  export const Layer: typeof Layer;
  export const ManagedRuntime: typeof ManagedRuntime;
}

declare class ZerospinError {
  constructor(props: {
    code: string;
    message?: string;
    cause?: string | null;
    status?: number | null;
    extra?: unknown;
  });
  pipe(...fns: unknown[]): unknown;
  static prettyUnknownFailure(error: unknown): string;
  static catch(props: { code: string }): (error: unknown) => ZerospinError;
}

declare function encodeRpc<A>(effect: unknown): unknown;
declare function decodeRpc<A, E>(effect: unknown): unknown;
declare function makeAsync<A>(
  fn: () => Promise<A>,
  onError?: (error: unknown) => ZerospinError,
): unknown;
