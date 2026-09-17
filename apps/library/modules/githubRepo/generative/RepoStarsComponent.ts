import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const repoStarsComponent = defineComponent({
  type: "RepoStars",
  props: {
    stargazers_count: primitives.integer(),
  },
  description: 'Star count. Bind stargazers_count with { "$state": "/stargazers_count" }.',
});
