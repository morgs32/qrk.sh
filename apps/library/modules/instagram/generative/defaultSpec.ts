import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "card-1",
  elements: {
    "card-1": {
      type: "InstagramCard",
      props: {
        username: { $state: "/username" },
      },
      children: ["grid-1", "footer-1"],
    },
    "grid-1": {
      type: "InstagramPostGrid",
      props: {
        username: { $state: "/username" },
        postImageUrl1: { $state: "/postImageUrl1" },
        postImageUrl2: { $state: "/postImageUrl2" },
        postImageUrl3: { $state: "/postImageUrl3" },
        postImageUrl4: { $state: "/postImageUrl4" },
      },
    },
    "footer-1": {
      type: "InstagramMediaFooter",
      props: {
        username: { $state: "/username" },
        followersText: { $state: "/followersText" },
      },
    },
  },
};
