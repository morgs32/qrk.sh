import type { IInferDecodedRow } from "@zerospin/shapes";
import type { figmaThumbnailV1 } from "./figmaThumbnailV1";

const defaultData = {
  title: "Figma Thumbnail",
  url: "",
  thumbnail_url: null,
  thumbnail_width: 789,
  thumbnail_height: 450,
};

export const figmaThumbnailPreviewState = {
  payload: { url: "" },
  data: defaultData,
} satisfies IInferDecodedRow<typeof figmaThumbnailV1.stateShape>;
