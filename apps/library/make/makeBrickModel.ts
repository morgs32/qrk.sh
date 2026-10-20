import { makeModelVersion } from "@zerospin/core/models/make/makeModelVersion";
import { primitives } from "@zerospin/shapes";
import type { IModel } from "@zerospin/core/models/types";
import { Schema } from "effect";

export function makeBrickModel<const PAGE extends Pick<IModel, "table">>(props: { page: PAGE; identity: { name: "brick"; abbreviation: "brk" } }) {
  const { page, identity } = props;
  return makeModelVersion(identity, {
    version: "1.0.0",
    attributes: {
      pageId: primitives.ref({ table: page.table, relation: "page", inverse: "bricks" }),
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
}
