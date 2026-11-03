import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const followersComponentMetadata = defineComponentMetadata({
  type: "Followers",
  propsShape: {
    followers: primitives.integer(),
  },
  description:
    'Follower count. Bind followers with { "$state": "/followers" }. Do not invent empty literals. No implied parent.',
});
