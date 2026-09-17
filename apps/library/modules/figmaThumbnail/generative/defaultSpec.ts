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
        title: { $state: "/data/title" },
        thumbnail_url: { $state: "/data/thumbnail_url" },
        thumbnail_width: { $state: "/data/thumbnail_width" },
        thumbnail_height: { $state: "/data/thumbnail_height" },
        imagePosition: "left",
      },
    },
    "footer-1": {
      type: "FigmaMediaFooter",
      props: {
        title: { $state: "/data/title" },
        url: { $state: "/data/url" },
      },
    },
  },
};
