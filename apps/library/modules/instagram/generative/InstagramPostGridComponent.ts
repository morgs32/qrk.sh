import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const instagramPostGridComponent = defineComponent({
  type: "InstagramPostGrid",
  props: {
    username: primitives.text(),
    postImageUrl1: primitives.text(),
    postImageUrl2: primitives.text(),
    postImageUrl3: primitives.text(),
    postImageUrl4: primitives.text(),
  },
  description:
    "2x2 latest-posts image grid. Bind the four postImageUrl* fields and username for alt text.",
});
