import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
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
        url: { $state: "/data/url" },
        title: { $state: "/data/title" },
        siteName: { $state: "/data/siteName" },
        iconUrl: { $state: "/data/iconUrl" },
      },
    },
    "hero-1": {
      type: "LinkHeroImage",
      props: {
        imageUrl: { $state: "/data/imageUrl" },
      },
    },
  },
};
