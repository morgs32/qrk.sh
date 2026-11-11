import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";

export const instagramMediaFooterComponentMetadata = defineComponentMetadata({
  type: "InstagramMediaFooter",
  propsShape: {
    username: primitives.text(),
    followersText: primitives.text(),
  },
  description:
    "Instagram-branded media footer with @username and followersText. Bind both from state.",
});
