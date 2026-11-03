import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const instagramCardComponentMetadata = defineComponentMetadata({
  type: "InstagramCard",
  propsShape: {
    username: primitives.text(),
  },
  slots: ["default"],
  description:
    'Linked Instagram profile card shell. Bind username with { "$state": "/username" } for the profile href.',
});
