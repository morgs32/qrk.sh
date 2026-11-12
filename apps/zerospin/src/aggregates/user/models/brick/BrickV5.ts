import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { brickV4 } from "./BrickV4";

export const brickV5 = upgradeModelVersion(brickV4, {
  version: 5,
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
        "spotify",
      ],
    }),
  },
});
