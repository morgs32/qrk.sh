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
    : Fn
  : never;

export type ISyncTargetApi<T> = T extends ITargetApiBrand
  ? Prettify<{
      [K in keyof T]: T[K] extends (...args: never) => unknown
        ? ISyncMethodReturn<T[K]>
        : T[K];
    }>
  : T;

type ISyncApis<
  APIS extends {
    [Brand.BrandTypeId]: 'Apis';
  },
> = Prettify<{
  [K in keyof APIS]: APIS[K] extends (...args: never) => unknown
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
