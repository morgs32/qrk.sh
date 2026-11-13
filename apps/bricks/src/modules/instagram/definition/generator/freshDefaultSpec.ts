import type { Spec } from "@json-render/core";

export const freshDefaultSpec: Spec = {
  root: "card-1",
  elements: {
    "card-1": {
      type: "InstagramCard",
      props: {
        username: { $state: "/brickState/data/username" },
      },
      children: ["grid-1", "footer-1"],
    },
    "grid-1": {
      type: "InstagramPostGrid",
      props: {
        username: { $state: "/brickState/data/username" },
        postImageUrls: { $state: "/brickState/data/postImageUrls" },
      },
    },
    "footer-1": {
      type: "InstagramMediaFooter",
      props: {
        username: { $state: "/brickState/data/username" },
        followersText: { $state: "/brickState/data/followersText" },
      },
    },
  },
};
