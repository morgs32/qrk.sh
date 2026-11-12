import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { brickV3 } from "./BrickV3";

export const brickV4 = upgradeModelVersion(brickV3, {
  version: 4,
  attributes: {
    moduleId: primitives.enum({
      values: [
        "article",
        "figma-thumbnail",
        "github-activity",
        "github-profile",
        "github-repo",
        "image",
        "image-carousel",
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
