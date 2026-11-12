import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { brickV5 } from "./BrickV5";

export const brickV6 = upgradeModelVersion(brickV5, {
  version: 6,
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
        "youtube",
      ],
    }),
  },
});
