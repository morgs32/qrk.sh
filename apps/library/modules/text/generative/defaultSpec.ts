import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "brick-1",
  elements: {
    "brick-1": {
      type: "TextBrick",
      props: {
        title: "Text brick",
        category: "Sample",
      },
    },
  },
};
