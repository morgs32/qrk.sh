import { makeModelVersion } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/schema";

import { wallModelV1 } from "../wall/wallModelV1";
import { membership } from "./membership";

export const membershipModelV1 = makeModelVersion(membership, {
  attributes: {
    wallId: primitives.ref({
      table: wallModelV1.table,
      relation: "wall",
      inverse: "memberships",
    }),
    moduleId: primitives.enum({
      values: [
        "figma-thumbnail",
        "github-activity",
        "github-profile",
        "github-repo",
        "image",
        "instagram",
        "link",
        "map-place",
        "swatch-and-icon",
        "text",
      ],
    }),
    // Polymorphic id of the typed module row; moduleId selects the table.
    moduleResourceId: primitives.text(),
  },
  indexes: [],
  version: "1.0.0",
});
