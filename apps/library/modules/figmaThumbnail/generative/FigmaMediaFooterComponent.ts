import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const figmaMediaFooterComponent = defineComponent({
  type: "FigmaMediaFooter",
  props: {
    title: primitives.text(),
    url: primitives.text(),
  },
  description: 'Figma-branded media footer with linked title. Bind title and url from state.',
});
