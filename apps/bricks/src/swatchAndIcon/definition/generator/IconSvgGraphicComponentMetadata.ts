import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";

export const iconSvgGraphicComponentMetadata = defineComponentMetadata({
  type: "IconSvgGraphic",
  propsShape: {
    name: primitives.text(),
    svg: primitives.text(),
  },
  description:
    'Centered SVG icon. Bind name with { "$state": "/name" } and svg with { "$state": "/svg" }.',
});
