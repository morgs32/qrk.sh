import type { SessionCommandSchema } from '../aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type { IAggregateSessionLock } from '../aggregateSession/AggregateSessionLockSchema.ts';
import type { IActorDelta } from '../aggregateSession/types.ts';
import type { IBrowserCommand } from '../contracts/BrowserCommandSchema.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import type { IServiceSessionLock } from '../serviceSession/ServiceSessionLockSchema.ts';
export type INodeCommandInput = Omit<
  typeof SessionCommandSchema.Encoded,
  | 'sessionId'
  | 'sessionIndex'
  | 'pushIndex'
  | 'failure'
  | 'aggregateId'
  | 'aggregateName'
> &
  Readonly<{
    targetId: string;
    targetName: string;
  }>;
export type INodeOutcome = {
  readonly id: IBrowserCommand['id'];
  readonly commandName: string;
  readonly ownerIndex: number;
  readonly nodeId: string;
  readonly nodeIndex: number;
  readonly executedIndex: number;
  readonly executedHash: string;
  readonly actorDelta: IActorDelta;
  readonly failure: IBrowserCommand['failure'];
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
  readonly ownerIndex: number;
  readonly resolvedThrough: number;
  readonly resources: readonly INodeResource[];
};
