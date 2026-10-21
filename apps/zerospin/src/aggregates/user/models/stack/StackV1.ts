import { modelRef, makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { section } from "../section/section";

import { stack } from "./stack";

export const stackV1 = makeModelVersion(stack, {
  version: 1,
  attributes: {
    sectionId: modelRef({ model: section, relation: "section", inverse: "stacks" }),
    name: primitives.text({ defaultValue: "Stack" }),
    position: primitives.integer(),
  },
  indexes: [{ name: "section_position", columns: ["sectionId", "position"] }],
});
