import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const followingComponent = defineComponent({
  type: "Following",
  props: {
    following: primitives.integer(),
  },
  description:
    'Following count. Bind following with { "$state": "/following" }. Do not invent empty literals. No implied parent.',
});
