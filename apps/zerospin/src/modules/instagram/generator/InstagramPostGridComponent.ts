import { primitives } from "@zerospin/shapes";
import { Schema } from "effect";

import { defineComponent } from "../../make/defineComponent";

export const instagramPostGridComponent = defineComponent({
  type: "InstagramPostGrid",
  props: {
    username: primitives.text(),
    postImageUrls: primitives.json({
      schema: Schema.mutable(Schema.Array(Schema.String).check(Schema.isMaxLength(4))),
    }),
  },
  description:
    "2x2 latest-posts image grid. Bind postImageUrls (zero to four ordered images) and username for alt text. The grid is omitted when the array is empty.",
});
