import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const repoNameComponent = defineComponent({
  type: "RepoName",
  props: {
    name: primitives.text(),
  },
  description: 'Repository name heading. Bind name with { "$state": "/name" }.',
});
