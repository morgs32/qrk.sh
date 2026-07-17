/*
 * System-worker annotation:
 * Finds selected refs that left the actor/frontend graph.
 */

import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import type { IRefRecord } from '@zerospin/core/system/types';

export function getDeletedRefs(props: {
  originSelectedRefs: IRefRecord;
  destinationSelectedResources: Readonly<Record<string, IEncodedResourceShape>>;
}): IRefRecord {
  const { destinationSelectedResources, originSelectedRefs } = props;
  const deleted: IRefRecord = {};

  // 1. Walk origin refs because deleted actor deltas need refs, not full rows.
  for (const [resourceId, ref] of Object.entries(originSelectedRefs)) {
    // 2. Keep only refs that are absent from the destination selected resources.
    if (destinationSelectedResources[resourceId] !== undefined) {
      continue;
    }

    deleted[resourceId] = ref;
  }

  return deleted;
}
