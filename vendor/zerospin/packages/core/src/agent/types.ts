import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/shapes';
import type { ManagedRuntime } from 'effect';
import type { StoreApi } from 'zustand/vanilla';

import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '../aggregateSession/types.ts';
import type { ISQLiteModuleFactory } from '../drizzle/make/makeInMemorySQLite3/waSqliteModuleFactory/waSqliteModuleFactory.ts';
import type {
  IActorSelections,
  IAnyActorDbVersion,
  ISelection,
} from '../models/make/makeActorDbVersion.ts';
import type { IModel } from '../models/types.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';

export type IAgentSessionDefinition = IAggregateSessionDefinition & {
  readonly db: IAnyActorDbVersion;
  readonly selections: IActorSelections;
  readonly capturedSelections: Readonly<Record<string, ISelection>>;
  readonly contractBindings: Readonly<
    Record<
      string,
      Readonly<{
        model: IModel;
        bind: Readonly<Record<string, string>>;
      }>
    >
  >;
};
export type IAgentSessionBootstrap = Readonly<{
  snapshot: unknown;
  webSocketUrl: string;
  outcomes: unknown;
  resolvedThrough: number;
}>;
export type IAgentConnectionState = Readonly<{
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
export type IAgentSession<
  DEFINITION extends IAgentSessionDefinition = IAgentSessionDefinition,
> = IAggregateSession<DEFINITION> & {
  readonly connection: StoreApi<IAgentConnectionState>;
  readonly runtime: ManagedRuntime.ManagedRuntime<
    CuidFactory | MonotonicFactory,
    IAnyError
  >;
  initialize(props: {
    aggregateId: string;
    sqliteModuleFactory?: ISQLiteModuleFactory;
    bootstrap(props: {
      signal: AbortSignal;
      nodeId: string;
    }): Promise<IAgentSessionBootstrap>;
  }): Promise<void>;
  dispose(): Promise<void>;
};
