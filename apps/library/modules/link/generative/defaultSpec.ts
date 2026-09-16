import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "card-1",
  elements: {
    "card-1": {
      type: "LinkCard",
      props: {
        url: { $state: "/url" },
      },
      children: ["copy-1", "hero-1"],
    },
    "copy-1": {
      type: "LinkCopy",
      props: {
        title: { $state: "/title" },
        siteName: { $state: "/siteName" },
        iconUrl: { $state: "/iconUrl" },
      },
    },
    "hero-1": {
      type: "LinkHeroImage",
      props: {
        imageUrl: { $state: "/imageUrl" },
      },
    },
  },
};
