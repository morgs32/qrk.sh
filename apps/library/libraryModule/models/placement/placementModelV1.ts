import { makeModelVersion } from "@zerospin/core/models/make/makeModelVersion";
import { primitives } from "@zerospin/shapes";
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
  const { brick } = props;
  return makeModelVersion(placement, {
    attributes: {
      brickId: primitives.ref({
        table: brick.table,
        relation: "brick",
        inverse: "placements",
      }),
      breakpoint: primitives.enum({
        values: ["sm", "md", "lg", "xl"],
      }),
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
      measured: primitives.json({
        nullable: true,
        defaultValue: null,
        schema: Schema.Struct({
          widthPx: Schema.Int.check(Schema.isGreaterThan(0)),
          heightPx: Schema.Int.check(Schema.isGreaterThan(0)),
        }),
      }),
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
