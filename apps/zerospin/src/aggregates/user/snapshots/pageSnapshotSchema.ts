import { WallSnapshotSchema } from "@qrk.sh/library/wallSnapshotSchema";
import { Schema } from "effect";

import { pageV1 } from "../models/page/PageV1";

export const PageSnapshotSchema = Schema.Struct({
  slug: Schema.toType(pageV1.attributesSchema.fields.slug),
  title: Schema.toType(pageV1.attributesSchema.fields.title),
  description: Schema.toType(pageV1.attributesSchema.fields.description),
  wall: WallSnapshotSchema,
});
