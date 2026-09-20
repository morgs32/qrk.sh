import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const bioComponent = defineComponent({
  type: "Bio",
  props: {
    bio: primitives.text({ nullable: true }),
  },
  description:
    'Profile bio text. Bind bio with { "$state": "/bio" }. Do not invent empty literals. No implied parent.',
});
