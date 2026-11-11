import type { IInferDecodedRow } from "@zerospin/shapes";
import type { imageV2 } from "./imageV2";

const defaultData = {
  crop: null,
  imageUrl:
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
  title: "White Bay Power Station",
};

export const imagePreviewState = defaultData satisfies IInferDecodedRow<typeof imageV2.stateShape>;
