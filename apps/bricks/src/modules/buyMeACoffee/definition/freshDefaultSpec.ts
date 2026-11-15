import type { Spec } from "@json-render/core";

export const freshDefaultSpec: Spec = {
  root: "shell",
  elements: {
    shell: { type: "BrickShell", props: {}, children: ["support"] },
    support: {
      type: "BuyMeACoffeeCard",
      props: {
        url: { $state: "/brickState/payload/url" },
        message: { $state: "/brickState/payload/message" },
      },
    },
  },
};
