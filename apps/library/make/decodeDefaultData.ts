import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";

import type { IJsonValue } from "../worker/types.public";

/** Decode seeded module data, preserving extra provider fields. */
export function decodeDefaultData<const DATA_SHAPE extends IShape>(
  dataShape: DATA_SHAPE,
  defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>,
) {
  return Schema.decodeUnknownSync(Schema.toType(makeEffectSchema(dataShape)))(defaultData, {
    onExcessProperty: "preserve",
  });
}
