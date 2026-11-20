import { makeModelVersion, modelRef, primitives } from "@zerospin/sdk/browser";
import * as Schema from "effect/Schema";
import { page } from "../page/page";
import { brick } from "./brick";

export const brickV1 = makeModelVersion(brick, {
  version: 1,
  attributes: {
    pageId: modelRef({ model: page, relation: "page", inverse: "bricks" }),
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
        "text",
      ],
    }),
    state: primitives.json({ schema: Schema.Unknown }),
    borderWidth: primitives.integer({ defaultValue: 0 }),
  },
  indexes: [],
});
