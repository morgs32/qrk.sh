import { createContext } from 'react';

import { createStore, type StoreApi } from 'zustand/vanilla';

export interface IBrowserUserController {
  userId: string;
  isSharedWorkerEnabled: boolean;
  store: StoreApi<{
    userId: string;
    sharedWorkerUserApi: {
      listFrontendReplicas(): Promise<
        readonly {
          accountId: string;
          accountName: string;
          actorId: string;
          actorName: string;
          frontendName: string;
          frontendVersion: string;
          databaseName: string;
        }[]
      >;
    } | null;
    setSharedWorkerUserApi: (
      sharedWorkerUserApi: {
        listFrontendReplicas(): Promise<
          readonly {
            accountId: string;
            accountName: string;
            actorId: string;
            actorName: string;
            frontendName: string;
            frontendVersion: string;
            databaseName: string;
          }[]
        >;
      } | null,
    ) => void;
  }>;
}

export function makeBrowserUserController(
  userId: string,
  isSharedWorkerEnabled = false,
): IBrowserUserController {
  const store = createStore<{
    userId: string;
    sharedWorkerUserApi: {
      listFrontendReplicas(): Promise<
        readonly {
          accountId: string;
          accountName: string;
          actorId: string;
          actorName: string;
          frontendName: string;
          frontendVersion: string;
          databaseName: string;
        }[]
      >;
    } | null;
    setSharedWorkerUserApi: (
      sharedWorkerUserApi: {
        listFrontendReplicas(): Promise<
          readonly {
            accountId: string;
            accountName: string;
            actorId: string;
            actorName: string;
            frontendName: string;
            frontendVersion: string;
            databaseName: string;
          }[]
        >;
      } | null,
    ) => void;
  }>(set => ({
    userId,
    sharedWorkerUserApi: null,
    setSharedWorkerUserApi: sharedWorkerUserApi =>
      set(state => {
        if (state.sharedWorkerUserApi === sharedWorkerUserApi) {
          return state;
        }
        return { sharedWorkerUserApi };
      }),
  }));

  return {
    userId,
    isSharedWorkerEnabled,
    store,
  };
}

export const BrowserUserControllerContext =
  createContext<IBrowserUserController | null>(null);
