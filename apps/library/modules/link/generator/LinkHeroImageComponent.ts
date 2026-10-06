import { primitives } from "@zerospin/shapes";

import { defineComponent } from "../../../make/defineComponent";

export const linkHeroImageComponent = defineComponent({
  type: "LinkHeroImage",
  props: {
    imageUrl: primitives.text(),
  },
  description:
    'Right hero image band. Bind imageUrl with { "$state": "/imageUrl" }. Hidden when empty.',
});
