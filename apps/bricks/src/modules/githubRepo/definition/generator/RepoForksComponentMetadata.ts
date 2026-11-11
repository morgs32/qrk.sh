import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../../definition/defineComponentMetadata";

export const repoForksComponentMetadata = defineComponentMetadata({
  type: "RepoForks",
  propsShape: {
    forks_count: primitives.integer(),
  },
  description: 'Fork count. Bind forks_count with { "$state": "/forks_count" }. Hidden when zero.',
});
