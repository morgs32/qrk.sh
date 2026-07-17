import '@zerospin/server-only';
import type { ITypeError } from '../utils/types.ts';

import type { IActorApi, IAnyServiceQuery } from './types.ts';

export function makeActorApi<QUERIES extends Record<string, IAnyServiceQuery>>(
  queries: QUERIES & {
    [K in keyof QUERIES & string]: QUERIES[K] extends { name: K }
      ? QUERIES[K]
      : ITypeError<`Bad query "${K}". The key in queries should match query.name`>;
  },
): IActorApi<QUERIES> {
  return queries;
}
