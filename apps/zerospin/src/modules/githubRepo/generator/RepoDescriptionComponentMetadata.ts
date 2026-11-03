import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const repoDescriptionComponentMetadata = defineComponentMetadata({
  type: "RepoDescription",
  propsShape: {
    description: primitives.text({ nullable: true }),
  },
  description:
    'Repository description. Bind description with { "$state": "/description" }. Hidden when null/empty.',
});
