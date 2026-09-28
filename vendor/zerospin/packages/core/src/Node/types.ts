import type { SessionCommandSchema } from '../aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type { IAggregateSessionLock } from '../aggregateSession/AggregateSessionLockSchema.ts';
import type { IAggregateActorCommand } from '../aggregateSession/types.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import type { IServiceSessionLock } from '../serviceSession/ServiceSessionLockSchema.ts';

export type INodeCommandInput = Omit<
  typeof SessionCommandSchema.Encoded,
  'sessionId' | 'sessionIndex' | 'pushIndex' | 'admission' | 'execution'
>;

export type INodeOutcome = IAggregateActorCommand & {
  readonly nodeId: string;
  readonly nodeIndex: number;
};

export type INodeIdentity = Readonly<{
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  kind: 'aggregate' | 'service';
  targetName: string;
  targetVersion: string;
  targetId: string;
  actorName: string;
  actorVersion: string;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  definitionHash: string;
}>;

export type INodeDefinition = Readonly<{
  identity: INodeIdentity;
  lock: IAggregateSessionLock | IServiceSessionLock;
}>;

export type INodeCheckpoint = Readonly<{
  executedIndex: number;
  executedHash: string;
}>;

export type INodeResource = IEncodedResourceShape;

export type INodeRecovery = INodeCheckpoint & {
  readonly aggregateIndex: number;
  readonly resolvedThrough: number;
  readonly resources: readonly INodeResource[];
};
