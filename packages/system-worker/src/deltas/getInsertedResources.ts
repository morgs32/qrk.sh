/*
 * System-worker annotation:
 * Finds selected resources that entered the actor/frontend graph.
 */

import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import type { IRefRecord } from '@zerospin/core/system/types';

export function getInsertedResources(props: {
  originSelectedRefs: IRefRecord;
  destinationSelectedResources: Readonly<Record<string, IEncodedResourceShape>>;
}): Record<string, IEncodedResourceShape> {
  const { destinationSelectedResources, originSelectedRefs } = props;
  const inserted: Record<string, IEncodedResourceShape> = {};

  // 1. Walk destination resources because inserted actor deltas need full rows.
  for (const [resourceId, resource] of Object.entries(
    destinationSelectedResources,
  )) {
    // 2. Keep only resources that were not selected before this block.
    if (originSelectedRefs[resourceId] !== undefined) {
      continue;
    }

    inserted[resourceId] = resource;
  }

  return inserted;
}
