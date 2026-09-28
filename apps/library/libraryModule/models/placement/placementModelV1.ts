import { makeModelVersion } from "@zerospin/core/models/make/makeModelVersion";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { makeBrickModel } from "../brick/makeBrickModel";
import { placement } from "./placement";

const gridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

const placementSpecSchema = Schema.Struct({
  root: Schema.String,
  elements: Schema.Record(Schema.String, Schema.Unknown),
  state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

export function makePlacementModel(props: { brick: ReturnType<typeof makeBrickModel> }) {
  return makeModelVersion(placement, {
    attributes: {
      brickId: primitives.ref({
        table: props.brick.table,
        relation: "brick",
        inverse: "placements",
      }),
      breakpoint: primitives.enum({
        values: ["sm", "md", "lg", "xl"],
      }),
      spec: primitives.json({ schema: placementSpecSchema }),
      gridItem: primitives.json({ schema: gridItemSchema }),
      isVisible: primitives.boolean(),
    },
    indexes: [
      {
        name: "brick_breakpoint",
        columns: ["brickId", "breakpoint"],
        unique: true,
      },
    ],
    version: "1.0.0",
  });
}
