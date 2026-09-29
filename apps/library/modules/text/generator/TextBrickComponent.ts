import { primitives } from "@zerospin/schema";

import { TiptapDocSchema } from "../../../lib/TiptapDocSchema";
import { defineComponent } from "../../../make/defineComponent";

export const textBrickComponent = defineComponent({
  type: "TextBrick",
  props: {
    content: primitives.json({
      nullable: true,
      defaultValue: null,
      schema: TiptapDocSchema,
    }),
  },
  description:
    "Tiptap document; editable when placed in a wall. Bind content from module data ($state /content).",
});
