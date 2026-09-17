import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const blogComponent = defineComponent({
  type: "Blog",
  props: {
    blog: primitives.text(),
  },
  description:
    'Profile blog/link line. Bind blog with { "$state": "/blog" }. Do not invent empty literals. No implied parent.',
});
