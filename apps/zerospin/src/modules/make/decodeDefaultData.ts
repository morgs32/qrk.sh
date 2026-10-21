import { makeEffectSchema, type IInferDecodedRow, type IShape } from "@zerospin/shapes";
import { Schema } from "effect";

import type { IJsonValue } from "../types";

/** Decode seeded module data, discarding undeclared fields. */
export function decodeDefaultData<const DATA_SHAPE extends IShape>(
  dataShape: DATA_SHAPE,
  defaultData: IInferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>,
) {
  return Schema.decodeUnknownSync(Schema.toType(makeEffectSchema(dataShape)))(defaultData, {
    onExcessProperty: "ignore",
  });
}
