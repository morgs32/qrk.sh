import { createContext } from 'react';

import type { IWaSqliteClient } from '@zerospin/core/drizzle/types';
import type { IFrontendController } from '@zerospin/core/frontendController/types';

import type { ISessionProviderRuntime } from './types';

export type ISessionRegistryEntry = Readonly<{
  session: object;
  subscribe(onStoreChange: () => void): () => void;
  getState(): object;
  getLiveQueryDb(): { $client: IWaSqliteClient };
}>;

export const ZerospinProviderContext = createContext<Readonly<{
  mountedFrontends: Readonly<
    Record<
      string,
      Readonly<{
        frontend: IFrontendController;
      }>
    >
  >;
  sessions: ReadonlyMap<object, ISessionRegistryEntry>;
  sessionRuntime: ISessionProviderRuntime;
}> | null>(null);
