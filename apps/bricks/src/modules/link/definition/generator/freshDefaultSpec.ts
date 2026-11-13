import type { Spec } from "@json-render/core";

export const freshDefaultSpec: Spec = {
  root: "card-1",
  elements: {
    "card-1": {
      type: "LinkCard",
      props: {},
      children: ["copy-1", "hero-1"],
    },
    "copy-1": {
      type: "LinkCopy",
      props: {
        url: { $state: "/brickState/data/url" },
        title: { $state: "/brickState/data/title" },
        siteName: { $state: "/brickState/data/siteName" },
        iconUrl: { $state: "/brickState/data/iconUrl" },
      },
    },
    "hero-1": {
      type: "LinkHeroImage",
      props: {
        imageUrl: { $state: "/brickState/data/imageUrl" },
      },
    },
  },
};
