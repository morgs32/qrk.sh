import type {
  IDrizzleRelationsFromModels,
  ILiveRelationalQuery,
  IResourceDbConfig,
  IWaSqliteClient,
  IWaSqliteDrizzleDb,
} from '@zerospin/core/drizzle/types';
import type {
  IFrontendController,
  InferFrontendModels,
} from '@zerospin/core/frontendController/types';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import type { ISessionWaSqliteDb } from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';

import type { IReactFrontend, IReactServiceFrontend } from './types';
import { useCtxOrThrow } from './useCtxOrThrow';
import { useLiveQueryOnDb } from './useLiveQueryOnDb';

export function useLiveQuery<
  FRONTEND extends IFrontendController,
  QUERY extends ILiveRelationalQuery,
>(
  reactFrontend: Pick<IReactFrontend<FRONTEND>, 'kind' | 'ReactContext'>,
  props: {
    deps?: readonly unknown[];
    query(
      db: ISessionWaSqliteDb<
        InferFrontendModels<FRONTEND>,
        IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
      >,
    ): QUERY;
    tableNames?: readonly string[];
  },
): {
  readonly data: QUERY['_']['result'];
  readonly error: Error | undefined;
  readonly updatedAt: Date | undefined;
};
export function useLiveQuery<
  FRONTEND extends IServiceFrontendController,
  QUERY extends ILiveRelationalQuery,
>(
  reactFrontend: Pick<
    IReactServiceFrontend<FRONTEND>,
    'kind' | 'useCtxOrThrow'
  >,
  props: {
    deps?: readonly unknown[];
    query(
      db: IWaSqliteDrizzleDb<
        IResourceDbConfig<FRONTEND['models'], Record<never, never>>
      >,
    ): QUERY;
    tableNames?: readonly string[];
  },
): {
  readonly data: QUERY['_']['result'];
  readonly error: Error | undefined;
  readonly updatedAt: Date | undefined;
};
export function useLiveQuery(
  reactFrontend:
    | Pick<IReactFrontend<IFrontendController>, 'kind' | 'ReactContext'>
    | Pick<
        IReactServiceFrontend<IServiceFrontendController>,
        'kind' | 'useCtxOrThrow'
      >,
  props: {
    deps?: readonly unknown[];
    query(db: { $client: IWaSqliteClient }): ILiveRelationalQuery;
    tableNames?: readonly string[];
  },
): {
  readonly data: unknown;
  readonly error: Error | undefined;
  readonly updatedAt: Date | undefined;
} {
  const { deps = [], query, tableNames = [] } = props;
  let db: { $client: IWaSqliteClient };

  if (reactFrontend.kind === 'account') {
    const { session } = useCtxOrThrow(reactFrontend);
    db = getInitializedStateOrThrow({ session: session.coreSession }).db;
  } else {
    const { session } = reactFrontend.useCtxOrThrow();
    const state = session.store.getState();
    if (!state.isInitialized || state.db === null || state.schema === null) {
      throw new ZerospinError({
        code: 'service-session-store-not-initialized',
        message: 'Service session store is not initialized',
      });
    }
    db = state.db;
  }

  return useLiveQueryOnDb({
    deps,
    query,
    db,
    tableNames,
  });
}
