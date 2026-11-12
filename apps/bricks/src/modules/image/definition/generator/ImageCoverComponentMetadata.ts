import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../../definition/defineComponentMetadata";

export const imageCoverComponentMetadata = defineComponentMetadata({
  type: "ImageCover",
  propsShape: {
    imageUrl: primitives.text(),
    title: primitives.text(),
    imagePosition: primitives.text(),
  },
  description:
    "Cover image band. Bind imageUrl to the image source and title to the state's descriptive alt text. Use a literal imagePosition such as center.",
});
