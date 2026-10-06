import type { SessionCommandSchema } from '../aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type { StagingResultSchema } from '../aggregateSession/StagingResultSchema.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import type { IServiceSessionLock } from '../serviceSession/ServiceSessionLockSchema.ts';
import type { IServiceBrowserCommand } from '../serviceSession/types.ts';

export type IServiceNodeCommandInput = Omit<
  typeof SessionCommandSchema.Encoded,
  | 'sessionId'
  | 'sessionIndex'
  | 'pushIndex'
  | 'aggregateId'
  | 'aggregateName'
  | 'staging'
> &
  Readonly<{
    serviceName: string;
    staging: typeof StagingResultSchema.Encoded;
  }>;
export type IServiceStagedCommand = IServiceNodeCommandInput &
  Readonly<{
    nodeId: string;
    nodeIndex: number;
    admissionIndex: number | null;
  }>;
export type IServiceNodeIdentity = Readonly<{
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  serviceName: string;
  serviceVersion: string;
  actorName: string;
  actorVersion: string;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  definitionHash: string;
}>;
export type IServiceNodeDefinition = Readonly<{
  identity: IServiceNodeIdentity;
  lock: IServiceSessionLock;
}>;
export type IServiceNodeBaseline = Readonly<{
  serviceIndex: number;
  executedIndex: number;
  serviceHash: string;
  resolvedThrough: number;
  resources: readonly IEncodedResourceShape[];
}>;
export type IServiceNodeDelivery =
  | IServiceStagedCommand
  | IServiceBrowserCommand;
