import { primitives } from "@zerospin/shapes";

import { defineComponent } from "../../../make/defineComponent";

export const repoDescriptionComponent = defineComponent({
  type: "RepoDescription",
  props: {
    description: primitives.text({ nullable: true }),
  },
  description:
    'Repository description. Bind description with { "$state": "/description" }. Hidden when null/empty.',
});
