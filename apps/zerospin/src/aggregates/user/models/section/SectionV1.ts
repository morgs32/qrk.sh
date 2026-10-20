import { makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { wallV1 } from "../wall/WallV1";
import { section } from "./section";

export const sectionV1 = makeModelVersion(section, {
  version: "1.0.0",
  attributes: {
    wallId: primitives.ref({ table: wallV1.table, relation: "wall", inverse: "sections" }),
    position: primitives.integer(),
  },
  indexes: [{ name: "wall_position", columns: ["wallId", "position"] }],
});
