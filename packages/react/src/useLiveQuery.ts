import type {
  IDrizzleRelationsFromModels,
  ILiveRelationalQuery,
} from '@zerospin/core/drizzle/types';
import type {
  IFrontendController,
  InferFrontendModels,
} from '@zerospin/core/frontendController/types';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import type { ISessionWaSqliteDb } from '@zerospin/core/session/types';

import type { IReactFrontend } from './types';
import { useCtxOrThrow } from './useCtxOrThrow';
import { useLiveQueryOnDb } from './useLiveQueryOnDb';

export function useLiveQuery<
  FRONTEND extends IFrontendController,
  QUERY extends ILiveRelationalQuery,
>(
  reactFrontend: Pick<IReactFrontend<FRONTEND>, 'ReactContext'>,
  props: {
    deps?: readonly unknown[];
    query: (
      db: ISessionWaSqliteDb<
        InferFrontendModels<FRONTEND>,
        IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
      >,
    ) => QUERY;
    tableNames?: readonly string[];
  },
): {
  readonly data: QUERY['_']['result'];
  readonly error: Error | undefined;
  readonly updatedAt: Date | undefined;
} {
  const { deps = [], query, tableNames = [] } = props;
  const { session } = useCtxOrThrow(reactFrontend);
  const { db } = getInitializedStateOrThrow({ session });

  return useLiveQueryOnDb({
    deps,
    query,
    db,
    tableNames,
  });
}
