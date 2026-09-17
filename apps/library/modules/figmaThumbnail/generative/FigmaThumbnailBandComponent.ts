import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const figmaThumbnailBandComponent = defineComponent({
  type: "FigmaThumbnailBand",
  props: {
    title: primitives.text(),
    thumbnail_url: primitives.text({ nullable: true }),
    thumbnail_width: primitives.number({ nullable: true }),
    thumbnail_height: primitives.number({ nullable: true }),
    imagePosition: primitives.text(),
  },
  description:
    'Thumbnail media band with grid fallback. Bind thumbnail_url/title/sizes from data and imagePosition from options ({ "$state": "/imagePosition" }).',
});
