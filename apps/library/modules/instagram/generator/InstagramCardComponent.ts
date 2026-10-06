import { primitives } from "@zerospin/shapes";

import { defineComponent } from "../../../make/defineComponent";

export const instagramCardComponent = defineComponent({
  type: "InstagramCard",
  props: {
    username: primitives.text(),
  },
  slots: ["default"],
  description:
    'Linked Instagram profile card shell. Bind username with { "$state": "/username" } for the profile href.',
});
