import { modelRef, makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { wall } from "../wall/wall";
import { section } from "./section";

export const sectionV1 = makeModelVersion(section, {
  version: "1.0.0",
  attributes: {
    wallId: modelRef({ model: wall, relation: "wall", inverse: "sections" }),
    position: primitives.integer(),
  },
  indexes: [{ name: "wall_position", columns: ["wallId", "position"] }],
});
