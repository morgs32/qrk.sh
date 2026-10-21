import { primitives } from "@zerospin/shapes";

import { defineComponent } from "../../make/defineComponent";

export const articleBrickComponent = defineComponent({
  type: "ArticleBrick",
  props: {
    title: primitives.text(),
    subtitle: primitives.text(),
    content: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
  },
  description:
    "Article title, subtitle, and Markdown body rendered read-only. Bind title, subtitle, and content from module data ($state /title, /subtitle, /content).",
});
