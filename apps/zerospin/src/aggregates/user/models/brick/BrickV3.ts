import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { brickV2 } from "./BrickV2";

export const brickV3 = upgradeModelVersion(brickV2, {
  version: 3,
  attributes: {
    moduleId: primitives.enum({
      values: [
        "article",
        "figma-thumbnail",
        "github-activity",
        "github-profile",
        "github-repo",
        "image",
        "instagram",
        "link",
        "map-place",
        "swatch-and-icon",
        "behance",
        "buy-me-a-coffee",
      ],
    }),
  },
});
