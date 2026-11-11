import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../../definition/defineComponentMetadata";

export const repoNameComponentMetadata = defineComponentMetadata({
  type: "RepoName",
  propsShape: {
    name: primitives.text(),
  },
  description: 'Repository name heading. Bind name with { "$state": "/name" }.',
});
