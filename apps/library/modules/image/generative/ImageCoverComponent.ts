import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const imageCoverComponent = defineComponent({
  type: "ImageCover",
  props: {
    imageUrl: primitives.text(),
    title: primitives.text(),
    imagePosition: primitives.text(),
  },
  description:
    'Cover image band. Bind imageUrl with { "$state": "/imageUrl" }, title with { "$state": "/title" }, and imagePosition with { "$state": "/imagePosition" }.',
});
