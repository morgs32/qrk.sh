import { createContext } from 'react';

import type { IWaSqliteClient } from '@zerospin/core/drizzle/types';

import type { ISessionProviderRuntime } from './types';

export type ISessionRegistryEntry = Readonly<{
  session: object;
  subscribe(onStoreChange: () => void): () => void;
  getState(): object;
  getLiveQueryDb(): { $client: IWaSqliteClient };
}>;

export const ZerospinProviderContext = createContext<Readonly<{
  sessions: ReadonlyMap<object, ISessionRegistryEntry>;
  sessionRuntime: ISessionProviderRuntime;
}> | null>(null);
