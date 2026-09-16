import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "card-1",
  elements: {
    "card-1": {
      type: "ImageCard",
      props: {},
      children: ["cover-1", "footer-1"],
    },
    "cover-1": {
      type: "ImageCover",
      props: {
        imageUrl: { $state: "/imageUrl" },
        title: { $state: "/title" },
      },
    },
    "footer-1": {
      type: "MediaFooter",
      props: {
        heading: { $state: "/title" },
      },
    },
  },
};
