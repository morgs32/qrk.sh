import { prefixId } from "@zerospin/core/models/prefixId";

import { placement } from "./placement";

/** Stable placement resource id for a brick + breakpoint pair. */
export function makePlacementId(brickId: string, breakpoint: "sm" | "md" | "lg" | "xl") {
  return prefixId(placement, `${brickId}_${breakpoint}`);
}
