import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../../definition/defineComponentMetadata";

export const bioComponentMetadata = defineComponentMetadata({
  type: "Bio",
  propsShape: {
    bio: primitives.text({ nullable: true }),
  },
  description:
    'Profile bio text. Bind bio with { "$state": "/bio" }. Do not invent empty literals. No implied parent.',
});
