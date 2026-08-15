import { useContext } from 'react';

import type {
  IDrizzleRelationsFromModels,
  ILiveRelationalQuery,
  IResourceDbConfig,
  IWaSqliteClient,
  IWaSqliteDrizzleDb,
} from '@zerospin/core/drizzle/types';
import type {
  IAggregateFrontendController,
  IFrontendController,
  InferFrontendModels,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';
import type { ISessionWaSqliteDb } from '@zerospin/core/session/types';

import { useLiveQueryOnDb } from './useLiveQueryOnDb';
import { ZerospinProviderContext } from './ZerospinProviderContext';

export function useLiveQuery<
  FRONTEND extends IAggregateFrontendController,
  QUERY extends ILiveRelationalQuery,
>(
  selector: Readonly<{ frontend: FRONTEND }>,
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
  selector: Readonly<{ frontend: FRONTEND }>,
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
  selector: Readonly<{
    frontend: IFrontendController | IServiceFrontendController;
  }>,
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
  const provider = useContext(ZerospinProviderContext);
  if (provider === null) {
    throw new Error('useLiveQuery must be used within ZerospinApp.Provider.');
  }
  const entry = provider.sessions.get(selector);
  if (entry === undefined) {
    throw new Error(
      `ZerospinApp.Provider has no mounted session for frontend "${selector.frontend.frontendName}". Use the matching ZerospinApp.frontends entry.`,
    );
  }
  const { deps = [], query, tableNames = [] } = props;

  return useLiveQueryOnDb({
    deps,
    query,
    db: entry.getLiveQueryDb(),
    tableNames,
  });
}
