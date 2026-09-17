import type { InferDecodedRow, IShape } from "@zerospin/schema";

import type { IJsonValue } from "../worker/types.public";
import { decodeDefaultData } from "./decodeDefaultData";

/** In-place editable data. The React form is attached in `makeFrontend.data`. */
export function makeDataForm<const DATA_SHAPE extends IShape>(props: {
  dataShape: DATA_SHAPE;
  defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
}) {
  return {
    dataType: "form" as const,
    dataShape: props.dataShape,
    defaultData: decodeDefaultData(props.dataShape, props.defaultData),
  };
}
