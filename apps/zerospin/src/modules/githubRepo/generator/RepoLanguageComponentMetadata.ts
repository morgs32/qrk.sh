import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const repoLanguageComponentMetadata = defineComponentMetadata({
  type: "RepoLanguage",
  propsShape: {
    language: primitives.text({ nullable: true }),
  },
  description: 'Primary language. Bind language with { "$state": "/language" }. Hidden when null.',
});
