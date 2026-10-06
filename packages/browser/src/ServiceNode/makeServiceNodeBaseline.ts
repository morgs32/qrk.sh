import type { IServiceNodeBaseline } from '@zerospin/core/ServiceNode/types';
import type { IServiceSessionSnapshot } from '@zerospin/core/serviceSession/types';
export function makeServiceNodeBaseline(
  snapshot: IServiceSessionSnapshot,
): IServiceNodeBaseline {
  return {
    executedIndex: snapshot.executedIndex,
    serviceHash: snapshot.serviceHash,
    resolvedThrough: snapshot.resolvedThrough,
    serviceIndex: snapshot.serviceIndex,
    resources: snapshot.resources,
  };
}
