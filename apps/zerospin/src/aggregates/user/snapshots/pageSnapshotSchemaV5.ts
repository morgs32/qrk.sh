import { Schema } from "effect";
import { brickV3 } from "../models/brick/BrickV3";
import { PageSnapshotSchemaV4 } from "./pageSnapshotSchemaV4";

export const PageSnapshotSchemaV5 = Schema.Struct({
  ...PageSnapshotSchemaV4.fields,
  bricks: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      moduleId: Schema.toType(brickV3.attributesSchema.fields.moduleId),
      state: Schema.toType(brickV3.attributesSchema.fields.state),
      borderWidth: Schema.toType(brickV3.attributesSchema.fields.borderWidth),
    }),
  ),
});
