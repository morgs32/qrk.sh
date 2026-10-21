import { modelRef } from "@zerospin/sdk/browser";
import { makeModelVersion } from "@zerospin/core/models/make/makeModelVersion";
import { primitives } from "@zerospin/shapes";
import { Schema } from "effect";

const placementSpecSchema = Schema.Struct({
  root: Schema.String,
  elements: Schema.Record(Schema.String, Schema.Unknown),
  state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

export function makePlacementModel(props: {
  brick: { name: "brick"; abbreviation: "brk" };
  row: { name: "row"; abbreviation: "row" };
  identity: { name: "placement"; abbreviation: "plc" };
}) {
  const { brick, row, identity } = props;
  return makeModelVersion(identity, {
    attributes: {
      brickId: modelRef({
        model: brick,
        relation: "brick",
        inverse: "placements",
      }),
      rowId: modelRef({ model: row, relation: "row", inverse: "placements" }),
      position: primitives.integer(),
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
    indexes: [{ name: "row_position", columns: ["rowId", "position"] }],
    version: "1.0.0",
  });
}
