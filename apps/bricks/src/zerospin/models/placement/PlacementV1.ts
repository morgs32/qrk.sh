import { makeModelVersion, modelRef, primitives } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { brick } from "../brick/brick";
import { wall } from "../wall/wall";
import { placement } from "./placement";

export const placementV1 = makeModelVersion(placement, {
  version: 1,
  attributes: {
    brickId: modelRef({ model: brick, relation: "brick", inverse: "placements" }),
    wallId: modelRef({ model: wall, relation: "wall", inverse: "placements" }),
    layoutId: primitives.text(),
    state: primitives.json({ schema: Schema.Unknown }),
    widthWeight: primitives.number(),
  },
  indexes: [{ name: "wall_brick", columns: ["wallId", "brickId"], unique: true }],
});
