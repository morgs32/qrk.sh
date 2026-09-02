import { newHttpBatchRpcSession, type RpcTarget } from 'capnweb';

import { type Prettify } from './types.ts';

type ISyncMethodReturn<Fn extends (...args: never) => unknown> = Fn extends (
  ...args: infer A
) => infer R
  ? Awaited<R> extends RpcTarget
    ? (...args: A) => ISyncTargetApi<Awaited<R>>
    : (...args: A) => Promise<
        Awaited<R> extends infer VALUE
          ? VALUE extends object
            ? {
                [K in keyof VALUE]: VALUE[K] extends RpcTarget
                  ? ISyncTargetApi<VALUE[K]> & Disposable
                  : VALUE[K];
              }
            : VALUE
          : never
      >
  : never;

export type ISyncTargetApi<T> = T extends RpcTarget
  ? Prettify<{
      [K in Exclude<keyof T, keyof RpcTarget>]: T[K] extends (
        ...args: never
      ) => unknown
        ? ISyncMethodReturn<T[K]>
        : T[K];
    }>
  : T;

type ISyncApis<APIS extends RpcTarget> = Prettify<{
  [K in Exclude<keyof APIS, keyof RpcTarget>]: APIS[K] extends (
    ...args: never
  ) => unknown
    ? ISyncMethodReturn<APIS[K]>
    : APIS[K];
}>;

export function newSyncRpcSession<APIS extends RpcTarget>(apiUrl: string) {
  return newHttpBatchRpcSession<APIS>(apiUrl) as ISyncApis<APIS> & {
    [Symbol.dispose](): void;
  };
}
