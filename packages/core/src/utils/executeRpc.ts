import { ZerospinError } from '@zerospin/error';
import { makeTraceableApiTarget } from '@zerospin/logger';
import { type RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import { newSyncRpcSession } from './newSyncRpcSession.ts';

type IExecuteRpcApis<APIS extends RpcTarget> = {
  [K in Exclude<keyof APIS, keyof RpcTarget>]: APIS[K] extends (
    ...args: infer ARGS
  ) => infer RESULT
    ? Awaited<RESULT> extends RpcTarget
      ? (
          ...args: ARGS
        ) => ReturnType<typeof makeTraceableApiTarget<Awaited<RESULT>>>
      : never
    : never;
};

export const executeRpc = <APIS extends RpcTarget>(apiUrl: string) =>
  Effect.fn('executeRpc')(function* <A, E, R>(
    execute: (apis: IExecuteRpcApis<APIS>) => Effect.Effect<A, E, R>,
  ) {
    using rpcSession = newSyncRpcSession<APIS>(apiUrl);
    const apis = new Proxy(rpcSession, {
      get(target, prop, receiver) {
        if (typeof prop === 'symbol' || prop === 'then') {
          return Reflect.get(target, prop, receiver);
        }

        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function') {
          return value;
        }

        return (...args: unknown[]) =>
          makeTraceableApiTarget(Reflect.apply(value, target, args));
      },
    }) as IExecuteRpcApis<APIS>;
    const program = yield* Effect.try({
      try: () => execute(apis),
      catch: ZerospinError.catch({ code: 'async-failed' }),
    });
    return yield* program.pipe(
      Effect.catchIf(
        (error): error is Extract<E, Error> => error instanceof Error,
        error =>
          Effect.fail(ZerospinError.catch({ code: 'async-failed' })(error)),
      ),
    );
  });
