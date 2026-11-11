import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";

export const blogComponentMetadata = defineComponentMetadata({
  type: "Blog",
  propsShape: {
    blog: primitives.text(),
  },
  description:
    'Profile blog/link line. Bind blog with { "$state": "/blog" }. Do not invent empty literals. No implied parent.',
});
