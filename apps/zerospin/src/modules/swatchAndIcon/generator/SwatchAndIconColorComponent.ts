import { primitives } from "@zerospin/shapes";

import { defineComponent } from "../../make/defineComponent";

export const swatchAndIconColorComponent = defineComponent({
  type: "SwatchAndIconColor",
  props: {
    color: primitives.text(),
  },
  slots: ["default"],
  description:
    'Solid color field shell. Bind color with { "$state": "/payload/color" }; saved module color is shared across breakpoints.',
});
