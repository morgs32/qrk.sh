import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const repoLanguageComponent = defineComponent({
  type: "RepoLanguage",
  props: {
    language: primitives.text({ nullable: true }),
  },
  description:
    'Primary language. Bind language with { "$state": "/language" }. Hidden when null.',
});
