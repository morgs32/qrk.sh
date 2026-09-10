/*
 * System-worker annotation:
 * Finds selected resources that entered the actor/frontend graph.
 */

import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import type { IRefRecord } from '@zerospin/core/system/types';

/*
 * Selection comparison retains complete destination rows for resources
 * newly entering the graph. Existing source selections are excluded by the
 * shared resource-map key.
 *
 * 1. Allocate the inserted-resource result.
 * 2. Walk destination resources.
 * 3. Skip resources selected in the preceding graph.
 * 4. Retain each newly selected row.
 * 5. Return the inserted-resource map.
 */
export function getInsertedResources(props: {
  originSelectedRefs: IRefRecord;
  destinationSelectedResources: Readonly<Record<string, IEncodedResourceShape>>;
}): Record<string, IEncodedResourceShape> {
  const { destinationSelectedResources, originSelectedRefs } = props;

  // 1 — retain full IEncodedResourceShape values
  const inserted: Record<string, IEncodedResourceShape> = {};

  // 1. Walk destination resources because inserted actor deltas need full rows.

  // 2 — destination rows provide the full newly selected resource
  for (const [resourceId, resource] of Object.entries(
    destinationSelectedResources,
  )) {
    // 2. Keep only resources that were not selected before this block.

    // 3 — test the same resourceId key in originSelectedRefs
    if (originSelectedRefs[resourceId] !== undefined) {
      continue;
    }

    // 4 — copy the full destination resource under its existing key
    inserted[resourceId] = resource;
  }

  // 5 — leave both input maps unchanged
  return inserted;
}
