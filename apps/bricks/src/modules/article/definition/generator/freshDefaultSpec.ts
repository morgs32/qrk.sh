import type { Spec } from "@json-render/core";

export const freshDefaultSpec: Spec = {
  root: "brick-1",
  elements: {
    "brick-1": {
      type: "ArticleBrick",
      props: {
        title: { $state: "/brickState/title" },
        subtitle: { $state: "/brickState/subtitle" },
        content: { $state: "/brickState/content" },
      },
    },
  },
};
