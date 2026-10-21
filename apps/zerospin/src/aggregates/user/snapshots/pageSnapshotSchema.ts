import { Schema } from "effect";
import { pageV1 } from "../models/page/PageV1";
import { brickV1 } from "../models/brick/BrickV1";
import { placementV1 } from "../models/placement/PlacementV1";
import { wallV1 } from "../models/wall/WallV1";

export const PageSnapshotSchema = Schema.Struct({
  slug: Schema.toType(pageV1.attributesSchema.fields.slug),
  title: Schema.toType(pageV1.attributesSchema.fields.title),
  description: Schema.toType(pageV1.attributesSchema.fields.description),
  bricks: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      moduleId: Schema.toType(brickV1.attributesSchema.fields.moduleId),
      state: Schema.toType(brickV1.attributesSchema.fields.state),
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
              rows: Schema.Array(
                Schema.Struct({
                  id: Schema.String,
                  placements: Schema.Array(
                    Schema.Struct({
                      id: Schema.String,
                      brickId: Schema.String,
                      variantId: Schema.toType(placementV1.attributesSchema.fields.variantId),
                      spec: Schema.toType(placementV1.attributesSchema.fields.spec),
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
