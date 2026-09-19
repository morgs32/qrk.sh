import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const publicReposComponent = defineComponent({
  type: "PublicRepos",
  props: {
    public_repos: primitives.integer(),
  },
  description:
    'Public repository count. Bind public_repos with { "$state": "/public_repos" }. Do not invent empty literals. No implied parent.',
});
