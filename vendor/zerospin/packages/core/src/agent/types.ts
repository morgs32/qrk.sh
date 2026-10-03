import type { StoreApi } from 'zustand/vanilla';

import type { IDb, IWaSqliteClient } from '../drizzle/types.ts';
import type { IAgentSpec } from '../system/types.ts';

export type IAgentDatabase = Pick<IDb, 'select'> & { $client: IWaSqliteClient };
export type IAgentPreviewBootstrap = Readonly<{
  snapshot: unknown;
  webSocketUrl: string;
}>;
export type IAgentSessionState = Readonly<{
  db: IAgentDatabase | null;
  isInitialized: boolean;
  status:
    | 'idle'
    | 'loading'
    | 'connecting'
    | 'live'
    | 'reconnecting'
    | 'error'
    | 'disposed';
  error: Error | null;
}>;
export type IAgentSession = Readonly<{
  agent: IAgentSpec;
  aggregateId: string;
  store: StoreApi<IAgentSessionState>;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}>;
