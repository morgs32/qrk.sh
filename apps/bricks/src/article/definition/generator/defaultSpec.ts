import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "brick-1",
  elements: {
    "brick-1": {
      type: "ArticleBrick",
      props: {
        title: { $state: "/title" },
        subtitle: { $state: "/subtitle" },
        content: { $state: "/content" },
      },
    },
  },
};
