import { placementSpecSchemaV2 } from "../../../../modules/make/makePlacementModel";
import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";

import { placementV1 } from "./PlacementV1";

export const placementV2 = upgradeModelVersion(placementV1, {
  version: "2.0.0",
  attributes: {
    spec: primitives.json({ schema: placementSpecSchemaV2 }),
  },
});
