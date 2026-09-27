import type { Effect } from 'effect';

import type { aggregateActorVersionChainDbConfig } from './aggregateActorVersionChainDbConfig.js';

type Retained = Effect.Success<
  ReturnType<
    typeof aggregateActorVersionChainDbConfig.tables.commands.decodeRow
  >
>;

/** Keep original input private while exposing only selected resources and owned phase summaries. */
export const projectActorCommand = (row: Retained) => ({
  id: row.id,
  nodeId: row.completionNodeId,
  nodeIndex: row.completionNodeIndex,
  aggregateIndex: row.actorAggregateIndex,
  executedIndex: row.executedIndex,
  executedHash: row.executedHash,
  actorDelta: row.actorDelta,
  admission: row.completionIdentity === null ? null : row.admission,
  execution:
    row.completionIdentity === null || row.execution === null
      ? null
      : row.execution.status === 'succeeded'
        ? {
            status: 'succeeded' as const,
            startedAt: row.execution.startedAt,
            completedAt: row.execution.completedAt,
          }
        : row.execution,
});
