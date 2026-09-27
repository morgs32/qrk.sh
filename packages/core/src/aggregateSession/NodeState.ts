export type IRetainedNodeState = Readonly<{
  nodeId: string;
  definitionHash: string;
  unresolvedCommands: number;
  authentication: string;
  synchronization: string;
  blockedWork: boolean;
  failure: string | null;
}>;

/** State of the shared durable node, independent of this tab's optimistic journal. */
export type INodeState = Readonly<{
  retainedNodes: readonly IRetainedNodeState[];
  nodeId: string;
  nodeIndex: number;
  outcomeIndex: number;
  uncertainHandoffs: number;
  pushPaused: boolean;
  localAvailability: string;
  authentication: string;
  synchronization: string;
  blockedWork: boolean;
  failure: string | null;
}>;
