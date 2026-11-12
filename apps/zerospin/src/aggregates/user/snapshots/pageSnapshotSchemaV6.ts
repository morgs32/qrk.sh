import { Schema } from "effect";
import { brickV4 } from "../models/brick/BrickV4";
import { PageSnapshotSchemaV4 } from "./pageSnapshotSchemaV4";

export const PageSnapshotSchemaV6 = Schema.Struct({
  ...PageSnapshotSchemaV4.fields,
  bricks: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      moduleId: Schema.toType(brickV4.attributesSchema.fields.moduleId),
      state: Schema.toType(brickV4.attributesSchema.fields.state),
      borderWidth: Schema.toType(brickV4.attributesSchema.fields.borderWidth),
    }),
  ),
});
