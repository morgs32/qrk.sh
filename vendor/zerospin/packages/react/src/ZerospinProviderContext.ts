import { createContext } from 'react';

import type { IWaSqliteClient } from '@zerospin/core/drizzle/types';
import type { IAnyFrontendController } from '@zerospin/core/frontendController/types';
import type { IAnyModels } from '@zerospin/core/models/types';

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
        frontend: IAnyFrontendController;
        models: Readonly<IAnyModels>;
      }>
    >
  >;
  sessions: ReadonlyMap<object, ISessionRegistryEntry>;
  sessionRuntime: ISessionProviderRuntime;
}> | null>(null);
