import type { InferDecodedRow, IShape } from "@zerospin/schema";

import type { IJsonValue } from "../worker/types.public";
import { decodeDefaultData } from "./decodeDefaultData";

/** Static seeded data with no in-place editor and no fetcher. */
export function makeData<const DATA_SHAPE extends IShape>(props: {
  dataShape: DATA_SHAPE;
  defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
}) {
  return {
    dataType: "static" as const,
    dataShape: props.dataShape,
    defaultData: decodeDefaultData(props.dataShape, props.defaultData),
  };
}
