import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "card-1",
  elements: {
    "card-1": {
      type: "FigmaCard",
      props: {},
      children: ["band-1", "footer-1"],
    },
    "band-1": {
      type: "FigmaThumbnailBand",
      props: {
        title: { $state: "/title" },
        thumbnail_url: { $state: "/thumbnail_url" },
        thumbnail_width: { $state: "/thumbnail_width" },
        thumbnail_height: { $state: "/thumbnail_height" },
        imagePosition: { $state: "/imagePosition" },
      },
    },
    "footer-1": {
      type: "FigmaMediaFooter",
      props: {
        title: { $state: "/title" },
        url: { $state: "/url" },
      },
    },
  },
};
