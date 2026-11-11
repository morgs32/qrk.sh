import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../../definition/defineComponentMetadata";

export const publicReposComponentMetadata = defineComponentMetadata({
  type: "PublicRepos",
  propsShape: {
    public_repos: primitives.integer(),
  },
  description:
    'Public repository count. Bind public_repos with { "$state": "/public_repos" }. Do not invent empty literals. No implied parent.',
});
