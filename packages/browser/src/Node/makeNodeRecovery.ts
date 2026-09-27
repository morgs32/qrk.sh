import type { nodeNetwork } from './nodeNetwork.ts';
import type { INodeRecovery } from './types.ts';

export function makeNodeRecovery(
  snapshot: Awaited<ReturnType<ReturnType<typeof nodeNetwork>['snapshot']>>,
): INodeRecovery {
  return {
    executedIndex:
      'executedIndex' in snapshot
        ? snapshot.executedIndex
        : snapshot.serviceIndex,
    executedHash:
      'executedHash' in snapshot ? snapshot.executedHash : snapshot.serviceHash,
    resolvedThrough:
      'resolvedThrough' in snapshot ? snapshot.resolvedThrough : 0,
    aggregateIndex: 'aggregateIndex' in snapshot ? snapshot.aggregateIndex : 0,
    resources: snapshot.resources,
  };
}
