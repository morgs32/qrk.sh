import { libraryModule } from "@qrk.sh/library/libraryModule";
import { Schema } from "effect";

import { pageV1 } from "../models/page/PageV1";

const { brick, placement } = libraryModule.models;

export const PageSnapshotSchema = Schema.Struct({
  slug: Schema.toType(pageV1.attributesSchema.fields.slug),
  title: Schema.toType(pageV1.attributesSchema.fields.title),
  description: Schema.toType(pageV1.attributesSchema.fields.description),
  wall: Schema.Struct({
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
  }),
});
