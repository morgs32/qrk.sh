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
    function fnUntraced<Name extends string>(name: Name): typeof fn;
    function gen<A, E, R>(
      fn: () => Generator<YieldWrap<Effect<any, any, any>>, A, never>,
    ): Effect<A, E, R>;
    function promise<A>(fn: () => Promise<A>): Effect<A, unknown, never>;
    const void_: Effect<void, never, never>;
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
    function runSync<A, E>(effect: Effect<A, E, never>): A;
    function mapError<A, E, R, E2>(
      effect: Effect<A, E, R>,
      fn: (e: E) => E2,
    ): Effect<A, E2, R>;
    function map<A, E, R, B>(
      effect: Effect<A, E, R>,
      fn: (a: A) => B,
    ): Effect<B, E, R>;
    function flatMap<A, E, R, B, E2, R2>(
      effect: Effect<A, E, R>,
      fn: (a: A) => Effect<B, E2, R2>,
    ): Effect<B, E | E2, R | R2>;
    namespace fn {
      type Return<A, E, R> = Effect<A, E, R>;
    }
  }
  export namespace Either {
    function isLeft<E, A>(
      either: { _tag: 'Left'; left: E } | { _tag: 'Right'; right: A },
    ): either is { _tag: 'Left'; left: E };
    function isRight<E, A>(
      either: { _tag: 'Left'; left: E } | { _tag: 'Right'; right: A },
    ): either is { _tag: 'Right'; right: A };
  }
  export namespace Layer {
    function mergeAll(...layers: unknown[]): unknown;
    function merge(a: unknown, b: unknown): unknown;
  }
  export class ManagedRuntime<R> {
    static make<R>(layer: unknown): ManagedRuntime<R>;
    runPromise<A, E>(effect: Effect.Effect<A, E, R>): Promise<A>;
    runSync<A, E>(effect: Effect.Effect<A, E, R>): A;
  }
  export namespace Context {
    class Tag<I, S> {
      static Generic: new <I, S>(id: string) => Tag<I, S>;
    }
  }
  export const Effect: typeof Effect;
  export const Either: typeof Either;
  export const Layer: typeof Layer;
  export const ManagedRuntime: typeof ManagedRuntime;
  export const Context: typeof Context;
}
