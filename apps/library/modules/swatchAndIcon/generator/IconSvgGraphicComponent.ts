import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const iconSvgGraphicComponent = defineComponent({
  type: "IconSvgGraphic",
  props: {
    name: primitives.text(),
    svg: primitives.text(),
  },
  description:
    'Centered SVG icon. Bind name with { "$state": "/name" } and svg with { "$state": "/svg" }.',
});
