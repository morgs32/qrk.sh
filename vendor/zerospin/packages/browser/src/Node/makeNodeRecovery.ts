import type { INodeRecovery } from '@zerospin/core/Node/types';

import type { nodeNetwork } from './nodeNetwork.ts';
export function makeNodeRecovery(
  snapshot: Awaited<ReturnType<ReturnType<typeof nodeNetwork>['snapshot']>>,
): INodeRecovery {
  return {
    executedIndex: snapshot.executedIndex,
    executedHash:
      'executedHash' in snapshot ? snapshot.executedHash : snapshot.serviceHash,
    resolvedThrough:
      'resolvedThrough' in snapshot ? snapshot.resolvedThrough : 0,
    ownerIndex:
      'aggregateIndex' in snapshot
        ? snapshot.aggregateIndex
        : snapshot.serviceIndex,
    resources: snapshot.resources,
  };
}
