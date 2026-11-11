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
    'Cover image band. Bind imageUrl with { "$state": "/imageUrl" }, title with { "$state": "/title" }, and imagePosition with { "$state": "/imagePosition" }.',
});
