import { Schema } from "effect";
import { placementSpecSchema } from "../../../definition/placementSpecSchema";
import { brickV1 } from "../brick/BrickV1";
import { pageV1 } from "../page/PageV1";
import { placementV1 } from "../placement/PlacementV1";
import { wallV1 } from "../wall/WallV1";
import { rowAlignmentSchema, rowPreferredWidthSchema } from "../wall/wallLayoutSchema";

export const pageSnapshotSchema = Schema.Struct({
  rowSizing: Schema.optional(Schema.Literal("preferred")),
  slug: Schema.toType(pageV1.attributesSchema.fields.slug),
  title: Schema.toType(pageV1.attributesSchema.fields.title),
  description: Schema.toType(pageV1.attributesSchema.fields.description),
  bricks: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      moduleId: Schema.toType(brickV1.attributesSchema.fields.moduleId),
      brickState: Schema.toType(brickV1.attributesSchema.fields.state),
      borderWidth: Schema.toType(brickV1.attributesSchema.fields.borderWidth),
    }),
  ),
  walls: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      breakpoint: Schema.toType(wallV1.attributesSchema.fields.breakpoint),
      sections: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          stacks: Schema.Array(
            Schema.Struct({
              id: Schema.String,
              name: Schema.String,
              widthWeight: Schema.optional(
                Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
              ),
              rows: Schema.Array(
                Schema.Struct({
                  id: Schema.String,
                  minHeight: Schema.NullOr(
                    Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(45)),
                  ),
                  preferredWidth: Schema.optional(rowPreferredWidthSchema),
                  alignment: Schema.optional(rowAlignmentSchema),
                  placements: Schema.Array(
                    Schema.Struct({
                      id: Schema.String,
                      brickId: Schema.String,
                      widthWeight: Schema.toType(placementV1.attributesSchema.fields.widthWeight),
                      layoutId: Schema.toType(placementV1.attributesSchema.fields.layoutId),
                      placementState: Schema.toType(placementV1.attributesSchema.fields.state),
                      spec: placementSpecSchema,
                    }),
                  ),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  ),
});
