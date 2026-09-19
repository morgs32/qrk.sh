import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const swatchAndIconColorComponent = defineComponent({
  type: "SwatchAndIconColor",
  props: {
    color: primitives.text(),
  },
  slots: ["default"],
  description:
    'Solid color field shell. Bind color with { "$state": "/color" } (from module options).',
});
