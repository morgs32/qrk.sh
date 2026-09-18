import { prefixId } from "@zerospin/core/models/prefixId";

import { placementModelV1 } from "../models/placement/placementModelV1";

/** Stable placement resource id for a membership + breakpoint pair. */
export function placementIdFor(
  membershipId: string,
  breakpoint: "sm" | "md" | "lg" | "xl",
) {
  return prefixId(placementModelV1, `${membershipId}_${breakpoint}`);
}
