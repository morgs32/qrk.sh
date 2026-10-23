import { modelRef } from "@zerospin/sdk/browser";
import { makeModelVersion } from "@zerospin/core/models/make/makeModelVersion";
import { primitives } from "@zerospin/shapes";
import { Schema } from "effect";
import { placementSpecSchema } from "../../../../modules/make/placementSpecSchema";
import { brick } from "../brick/brick";
import { placement } from "./placement";
import { wall } from "../wall/wall";

export const placementV1 = makeModelVersion(placement, {
  attributes: {
    brickId: modelRef({
      model: brick,
      relation: "brick",
      inverse: "placements",
    }),
    wallId: modelRef({ model: wall, relation: "wall", inverse: "placements" }),
    variantId: primitives.enum({ values: ["default"] }),
    specRevision: primitives.integer({ defaultValue: 0 }),
    generation: primitives.json({
      nullable: true,
      defaultValue: null,
      schema: Schema.Struct({
        requestId: Schema.String,
        prompt: Schema.String,
        baseStateRevision: Schema.Int,
        baseSpecRevision: Schema.Int,
        status: Schema.Literals(["generating", "ready", "failed", "superseded"]),
        error: Schema.NullOr(
          Schema.Struct({
            code: Schema.String,
            message: Schema.String,
            retryable: Schema.Boolean,
          }),
        ),
      }),
    }),
    spec: primitives.json({ schema: placementSpecSchema }),
  },
  indexes: [{ name: "wall_brick", columns: ["wallId", "brickId"], unique: true }],
  version: 1,
});
