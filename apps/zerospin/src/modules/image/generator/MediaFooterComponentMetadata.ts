import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const mediaFooterComponentMetadata = defineComponentMetadata({
  type: "MediaFooter",
  propsShape: {
    overline: primitives.text({ nullable: true }),
    heading: primitives.text({ nullable: true }),
    iconUrl: primitives.text({ nullable: true }),
  },
  slots: ["default"],
  description:
    "Pinned media chrome footer (optional iconUrl + overline/heading + optional trailing children).",
});
