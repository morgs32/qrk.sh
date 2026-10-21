import { makeModuleVersion } from "../make/makeModuleVersion";
import { figmaThumbnail } from "./figmaThumbnail";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";

export const figmaThumbnailV2 = makeModuleVersion(figmaThumbnail, {
  ...figmaThumbnailV1,
  version: "2.0.0",
  stateShape: {
    payload: figmaThumbnailV1.stateShape.payload,
    data: figmaThumbnailV1.stateShape.data,
  },
  defaultState: {
    payload: figmaThumbnailV1.defaultState.payload,
    data: figmaThumbnailV1.defaultState.data,
  },
});
