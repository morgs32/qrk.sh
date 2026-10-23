import { modelRef } from "@zerospin/sdk/browser";
import { makeModelVersion } from "@zerospin/core/models/make/makeModelVersion";
import { primitives } from "@zerospin/shapes";
import { Schema } from "effect";
import { brick } from "./brick";
import { page } from "../page/page";

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
        "instagram",
        "link",
        "map-place",
        "swatch-and-icon",
      ],
    }),
    stateRevision: primitives.integer({ defaultValue: 0 }),
    state: primitives.json({ schema: Schema.Unknown }),
  },
  indexes: [],
});
