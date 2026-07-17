import type { IAnyError } from '@zerospin/error';
import { Context, type Effect } from 'effect';

interface IAsync {
  readonly tryPromise: <SUCCESS, ERROR extends IAnyError>(props: {
    readonly try: () => PromiseLike<SUCCESS>;
    readonly catch: (cause: unknown) => ERROR;
  }) => Effect.Effect<SUCCESS, ERROR>;
}

export class Async extends Context.Tag('Async')<Async, IAsync>() {}
