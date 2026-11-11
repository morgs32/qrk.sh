import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";

export const repoStarsComponentMetadata = defineComponentMetadata({
  type: "RepoStars",
  propsShape: {
    stargazers_count: primitives.integer(),
  },
  description: 'Star count. Bind stargazers_count with { "$state": "/stargazers_count" }.',
});
