import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { brickV1 } from "./BrickV1";

export const brickV2 = upgradeModelVersion(brickV1, {
  version: 2,
  attributes: {
    borderWidth: primitives.integer({ defaultValue: 0 }),
  },
});
