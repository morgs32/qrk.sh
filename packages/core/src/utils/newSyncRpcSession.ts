import { newHttpBatchRpcSession } from 'capnweb';
import { type Brand } from 'effect';

import { type Prettify } from './types.ts';

type ITargetApiBrand =
  | { readonly [Brand.BrandTypeId]: 'TargetApi' }
  | { readonly [Brand.BrandTypeId]: { readonly TargetApi: 'TargetApi' } };

type ISyncMethodReturn<Fn extends (...args: never) => unknown> = Fn extends (
  ...args: infer A
) => infer R
  ? Awaited<R> extends ITargetApiBrand
    ? (...args: A) => ISyncTargetApi<Awaited<R>>
    : (...args: A) => Promise<
        Awaited<R> extends infer VALUE
          ? VALUE extends object
            ? {
                [K in keyof VALUE]: VALUE[K] extends ITargetApiBrand
                  ? ISyncTargetApi<VALUE[K]> & Disposable
                  : VALUE[K];
              }
            : VALUE
          : never
      >
  : never;

export type ISyncTargetApi<T> = T extends ITargetApiBrand
  ? Prettify<{
      [K in Exclude<keyof T, Brand.BrandTypeId>]: T[K] extends (
        ...args: never
      ) => unknown
        ? ISyncMethodReturn<T[K]>
        : T[K];
    }>
  : T;

type ISyncApis<
  APIS extends {
    [Brand.BrandTypeId]: 'Apis';
  },
> = Prettify<{
  [K in Exclude<keyof APIS, Brand.BrandTypeId>]: APIS[K] extends (
    ...args: never
  ) => unknown
    ? ISyncMethodReturn<APIS[K]>
    : APIS[K];
}>;

export function newSyncRpcSession<
  APIS extends {
    [Brand.BrandTypeId]: 'Apis';
  },
>(apiUrl: string) {
  return newHttpBatchRpcSession<APIS>(apiUrl) as ISyncApis<APIS> & {
    [Symbol.dispose](): void;
  };
}
