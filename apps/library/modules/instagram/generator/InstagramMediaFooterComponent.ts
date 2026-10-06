import { primitives } from "@zerospin/shapes";

import { defineComponent } from "../../../make/defineComponent";

export const instagramMediaFooterComponent = defineComponent({
  type: "InstagramMediaFooter",
  props: {
    username: primitives.text(),
    followersText: primitives.text(),
  },
  description:
    "Instagram-branded media footer with @username and followersText. Bind both from state.",
});
