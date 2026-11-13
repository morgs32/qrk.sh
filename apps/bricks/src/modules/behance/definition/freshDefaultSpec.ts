import type { Spec } from "@json-render/core";

export const freshDefaultSpec: Spec = {
  root: "shell",
  elements: {
    shell: { type: "BrickShell", props: {}, children: ["portfolio"] },
    portfolio: {
      type: "BehanceCard",
      props: {
        url: { $state: "/brickState/payload/url" },
        displayName: { $state: "/brickState/data/displayName" },
        projects: { $state: "/brickState/data/projects" },
      },
    },
  },
};
