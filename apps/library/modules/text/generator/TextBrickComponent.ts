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
  description: "Read-only TipTap document. Bind content from module data ($state /content).",
});
