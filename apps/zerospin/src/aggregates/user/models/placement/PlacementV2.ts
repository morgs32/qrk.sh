import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { placementV1 } from "./PlacementV1";

export const placementV2 = upgradeModelVersion(placementV1, {
  version: 2,
  attributes: {
    widthWeight: primitives.number(),
  },
});
