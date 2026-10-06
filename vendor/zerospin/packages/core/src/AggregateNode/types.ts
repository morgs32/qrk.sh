import type { SessionCommandSchema } from '../aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type { IAggregateSessionLock } from '../aggregateSession/AggregateSessionLockSchema.ts';
import type { IAggregateBrowserCommand } from '../aggregateSession/types.ts';
import type { IEncodedResourceShape } from '../models/types.ts';

export type IAggregateNodeCommandInput = Omit<
  typeof SessionCommandSchema.Encoded,
  'sessionId' | 'sessionIndex' | 'pushIndex'
>;
export type IAggregateStagedCommand = IAggregateNodeCommandInput &
  Readonly<{
    nodeId: string;
    nodeIndex: number;
    admissionIndex: number | null;
  }>;
export type IAggregateNodeIdentity = Readonly<{
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  aggregateName: string;
  aggregateVersion: string;
  aggregateId: string;
  actorName: string;
  actorVersion: string;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  definitionHash: string;
}>;
export type IAggregateNodeDefinition = Readonly<{
  identity: IAggregateNodeIdentity;
  lock: IAggregateSessionLock;
}>;
export type IAggregateNodeBaseline = Readonly<{
  aggregateIndex: number;
  executedIndex: number;
  executedHash: string;
  resolvedThrough: number;
  resources: readonly IEncodedResourceShape[];
}>;
export type IAggregateNodeDelivery =
  | IAggregateStagedCommand
  | IAggregateBrowserCommand;
