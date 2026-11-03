import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const linkHeroImageComponentMetadata = defineComponentMetadata({
  type: "LinkHeroImage",
  propsShape: {
    imageUrl: primitives.text(),
  },
  description:
    'Right hero image band. Bind imageUrl with { "$state": "/imageUrl" }. Hidden when empty.',
});
