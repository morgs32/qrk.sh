import { Schema } from "effect";

import { libraryModule } from "../libraryModule";

const { brick, placement } = libraryModule.models;

export const WallSnapshotSchema = Schema.Struct({
  bricks: Schema.Array(
    Schema.Struct({
      id: Schema.toType(brick.table.codec.fields.id),
      moduleId: Schema.toType(brick.attributesSchema.fields.moduleId),
      state: Schema.toType(brick.attributesSchema.fields.state),
      placements: Schema.Array(
        Schema.Struct({
          breakpoint: Schema.toType(placement.attributesSchema.fields.breakpoint),
          spec: Schema.toType(placement.attributesSchema.fields.spec),
          gridItem: Schema.toType(placement.attributesSchema.fields.gridItem),
          isVisible: Schema.toType(placement.attributesSchema.fields.isVisible),
        }),
      ),
    }),
  ),
});
