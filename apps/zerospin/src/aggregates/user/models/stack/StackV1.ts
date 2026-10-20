import { makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { sectionV1 } from "../section/SectionV1";
import { stack } from "./stack";

export const stackV1 = makeModelVersion(stack, {
  version: "1.0.0",
  attributes: {
    sectionId: primitives.ref({ table: sectionV1.table, relation: "section", inverse: "stacks" }),
    name: primitives.text({ defaultValue: "Stack" }),
    position: primitives.integer(),
  },
  indexes: [{ name: "section_position", columns: ["sectionId", "position"] }],
});
