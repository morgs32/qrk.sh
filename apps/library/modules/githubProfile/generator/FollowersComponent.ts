import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const followersComponent = defineComponent({
  type: "Followers",
  props: {
    followers: primitives.integer(),
  },
  description:
    'Follower count. Bind followers with { "$state": "/followers" }. Do not invent empty literals. No implied parent.',
});
