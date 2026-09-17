import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const mediaFooterComponent = defineComponent({
  type: "MediaFooter",
  props: {
    overline: primitives.text({ nullable: true }),
    heading: primitives.text({ nullable: true }),
    iconUrl: primitives.text({ nullable: true }),
  },
  slots: ["default"],
  description:
    "Pinned media chrome footer (optional iconUrl + overline/heading + optional trailing children).",
});
