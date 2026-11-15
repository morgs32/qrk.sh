import type { Spec } from "@json-render/core";

export const freshDefaultSpec: Spec = {
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
        title: { $state: "/brickState/data/title" },
        thumbnail_url: { $state: "/brickState/data/thumbnail_url" },
        thumbnail_width: { $state: "/brickState/data/thumbnail_width" },
        thumbnail_height: { $state: "/brickState/data/thumbnail_height" },
        imagePosition: "left",
      },
    },
    "footer-1": {
      type: "FigmaMediaFooter",
      props: {
        title: { $state: "/brickState/data/title" },
        url: { $state: "/brickState/data/url" },
      },
    },
  },
};
