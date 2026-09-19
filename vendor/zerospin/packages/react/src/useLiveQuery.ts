import { useMemo, useRef, useSyncExternalStore } from 'react';

import type {
  IDrizzleRelationsFromModels,
  ILiveRelationalQuery,
  IResourceDbConfig,
  IWaSqliteClient,
  IWaSqliteDrizzleDb,
} from '@zerospin/core/drizzle/types';
import type {
  IAggregateFrontendController,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import type { IServiceSession } from '@zerospin/core/serviceSession/types';
import type {
  ISession,
  ISessionWaSqliteDb,
} from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';

import { useLiveQueryOnDb } from './useLiveQueryOnDb';
function stableKeyEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    if (left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => stableKeyEquals(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    key =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      stableKeyEquals(leftRecord[key], rightRecord[key]),
  );
}

function useSessionDatabase(session: {
  store: {
    subscribe: (listener: () => void) => () => void;
    getState: () => {
      isInitialized: boolean;
      db: { $client: IWaSqliteClient } | null;
    };
  };
}): { $client: IWaSqliteClient } {
  const db = useSyncExternalStore(
    session.store.subscribe,
    () => session.store.getState().db,
    () => session.store.getState().db,
  );
  if (db === null) {
    throw new ZerospinError({
      code: 'session-store-not-initialized',
      message: 'Session store is not initialized',
    });
  }
  return db;
}

export function useLiveQuery<
  FRONTEND extends IAggregateFrontendController,
  MODELS extends IAnyModels & FRONTEND['models'],
  KEY,
  QUERY extends ILiveRelationalQuery,
>(props: {
  session: ISession<FRONTEND & { models: MODELS }>;
  key: KEY;
  query: (
    db: ISessionWaSqliteDb<MODELS, IDrizzleRelationsFromModels<MODELS>>,
    key: KEY,
  ) => QUERY;
  tableNames?: readonly string[];
}): {
  readonly data: QUERY['_']['result'];
  readonly error: Error | undefined;
  readonly updatedAt: Date | undefined;
};

export function useLiveQuery<
  FRONTEND extends IAggregateFrontendController,
  MODELS extends IAnyModels & FRONTEND['models'],
  QUERY extends ILiveRelationalQuery,
>(props: {
  session: ISession<FRONTEND & { models: MODELS }>;
  key?: undefined;
  query: (
    db: ISessionWaSqliteDb<MODELS, IDrizzleRelationsFromModels<MODELS>>,
  ) => QUERY;
  tableNames?: readonly string[];
}): {
  readonly data: QUERY['_']['result'];
  readonly error: Error | undefined;
  readonly updatedAt: Date | undefined;
};

export function useLiveQuery<
  FRONTEND extends IServiceFrontendController,
  MODELS extends IAnyModels & FRONTEND['models'],
  KEY,
  QUERY extends ILiveRelationalQuery,
>(props: {
  session: IServiceSession<FRONTEND, MODELS>;
  key: KEY;
  query: (
    db: IWaSqliteDrizzleDb<IResourceDbConfig<MODELS, Record<never, never>>>,
    key: KEY,
  ) => QUERY;
  tableNames?: readonly string[];
}): {
  readonly data: QUERY['_']['result'];
  readonly error: Error | undefined;
  readonly updatedAt: Date | undefined;
};

export function useLiveQuery<
  FRONTEND extends IServiceFrontendController,
  MODELS extends IAnyModels & FRONTEND['models'],
  QUERY extends ILiveRelationalQuery,
>(props: {
  session: IServiceSession<FRONTEND, MODELS>;
  key?: undefined;
  query: (
    db: IWaSqliteDrizzleDb<IResourceDbConfig<MODELS, Record<never, never>>>,
  ) => QUERY;
  tableNames?: readonly string[];
}): {
  readonly data: QUERY['_']['result'];
  readonly error: Error | undefined;
  readonly updatedAt: Date | undefined;
};

export function useLiveQuery(props: any): any {
  const { session, key, query, tableNames = [] } = props;
  const db = useSessionDatabase(session);

  const keyRef = useRef(key);
  const stableKey = useMemo(() => {
    if (stableKeyEquals(keyRef.current, key)) {
      return keyRef.current;
    }
    keyRef.current = key;
    return key;
  }, [key]);

  return useLiveQueryOnDb({
    db,
    key: stableKey,
    query,
    tableNames,
  });
}
