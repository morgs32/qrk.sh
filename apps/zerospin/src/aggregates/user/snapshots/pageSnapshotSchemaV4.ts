import { Schema } from "effect";
import { pageV1 } from "../models/page/PageV1";
import { brickV2 } from "../models/brick/BrickV2";
import { placementV2 } from "../models/placement/PlacementV2";
import { wallV2 } from "../models/wall/WallV2";
import { wallLayoutSchemaV2 } from "../layout/wallLayoutSchemaV2";

import { rowAlignmentSchema, rowPreferredWidthSchema } from "../layout/wallLayoutSchemaV3";

export const PageSnapshotSchemaV4 = Schema.Struct({
  rowSizing: Schema.optional(Schema.Literal("preferred")),
  slug: Schema.toType(pageV1.attributesSchema.fields.slug),
  title: Schema.toType(pageV1.attributesSchema.fields.title),
  description: Schema.toType(pageV1.attributesSchema.fields.description),
  bricks: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      moduleId: Schema.toType(brickV2.attributesSchema.fields.moduleId),
      state: Schema.toType(brickV2.attributesSchema.fields.state),
      borderWidth: Schema.toType(brickV2.attributesSchema.fields.borderWidth),
    }),
  ),
  walls: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      breakpoint: Schema.toType(wallV2.attributesSchema.fields.breakpoint),
      sections: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          stacks: Schema.Array(
            Schema.Struct({
              id: Schema.String,
              name: Schema.String,
              rows: Schema.Array(
                Schema.Struct({
                  id: Schema.String,
                  minHeight:
                    wallLayoutSchemaV2.fields.sections.schema.value.fields.stacks.schema.value
                      .fields.rows.schema.value.fields.minHeight,
                  preferredWidth: Schema.optional(rowPreferredWidthSchema),
                  alignment: Schema.optional(rowAlignmentSchema),
                  placements: Schema.Array(
                    Schema.Struct({
                      id: Schema.String,
                      brickId: Schema.String,
                      widthWeight: Schema.toType(placementV2.attributesSchema.fields.widthWeight),
                      variantId: Schema.toType(placementV2.attributesSchema.fields.variantId),
                      spec: Schema.toType(placementV2.attributesSchema.fields.spec),
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
