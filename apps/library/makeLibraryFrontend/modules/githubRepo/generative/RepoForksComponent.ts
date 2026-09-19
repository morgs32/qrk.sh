import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const repoForksComponent = defineComponent({
  type: "RepoForks",
  props: {
    forks_count: primitives.integer(),
  },
  description:
    'Fork count. Bind forks_count with { "$state": "/forks_count" }. Hidden when zero.',
});
