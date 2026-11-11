import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "card-1",
  elements: {
    "card-1": {
      type: "InstagramCard",
      props: {
        username: { $state: "/data/username" },
      },
      children: ["grid-1", "footer-1"],
    },
    "grid-1": {
      type: "InstagramPostGrid",
      props: {
        username: { $state: "/data/username" },
        postImageUrls: { $state: "/data/postImageUrls" },
      },
    },
    "footer-1": {
      type: "InstagramMediaFooter",
      props: {
        username: { $state: "/data/username" },
        followersText: { $state: "/data/followersText" },
      },
    },
  },
};
