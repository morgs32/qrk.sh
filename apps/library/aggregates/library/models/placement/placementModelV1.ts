import { makeModelVersion } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { membershipModelV1 } from "../membership/membershipModelV1";
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

export const placementModelV1 = makeModelVersion(placement, {
  attributes: {
    membershipId: primitives.ref({
      table: membershipModelV1.table,
      relation: "membership",
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
      name: "membership_breakpoint",
      columns: ["membershipId", "breakpoint"],
      unique: true,
    },
  ],
  version: "1.0.0",
});
