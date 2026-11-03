import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const swatchAndIconColorComponentMetadata = defineComponentMetadata({
  type: "SwatchAndIconColor",
  propsShape: {
    color: primitives.text(),
  },
  slots: ["default"],
  description:
    'Solid color field shell. Bind color with { "$state": "/payload/color" }; saved module color is shared across breakpoints.',
});
