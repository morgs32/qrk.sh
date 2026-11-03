import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const articleBrickComponentMetadata = defineComponentMetadata({
  type: "ArticleBrick",
  propsShape: {
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
