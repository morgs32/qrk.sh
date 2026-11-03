import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const figmaMediaFooterComponentMetadata = defineComponentMetadata({
  type: "FigmaMediaFooter",
  propsShape: {
    title: primitives.text(),
    url: primitives.text(),
  },
  description: "Figma-branded media footer with linked title. Bind title and url from state.",
});
