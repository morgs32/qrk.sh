import { primitives } from "@zerospin/schema";

import { TiptapDocSchema } from "../../../lib/TiptapDocSchema";
import { defineComponent } from "../../../make/defineComponent";

export const articleBrickComponent = defineComponent({
  type: "ArticleBrick",
  props: {
    title: primitives.text(),
    subtitle: primitives.text(),
    content: primitives.json({
      nullable: true,
      defaultValue: null,
      schema: TiptapDocSchema,
    }),
  },
  description:
    "Article title, subtitle, and Tiptap body rendered read-only. Bind title, subtitle, and content from module data ($state /title, /subtitle, /content).",
});
