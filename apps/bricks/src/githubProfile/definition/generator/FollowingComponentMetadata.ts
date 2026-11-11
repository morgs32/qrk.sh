import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";

export const followingComponentMetadata = defineComponentMetadata({
  type: "Following",
  propsShape: {
    following: primitives.integer(),
  },
  description:
    'Following count. Bind following with { "$state": "/following" }. Do not invent empty literals. No implied parent.',
});
