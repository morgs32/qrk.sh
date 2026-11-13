import type { Spec } from "@json-render/core";

export const freshDefaultSpec: Spec = {
  root: "swatch-1",
  elements: {
    "swatch-1": {
      type: "SwatchAndIconColor",
      props: {
        color: { $state: "/brickState/payload/color" },
      },
      children: ["icon-1"],
    },
    "icon-1": {
      type: "IconSvgGraphic",
      props: {
        name: { $state: "/brickState/data/name" },
        svg: { $state: "/brickState/data/svg" },
      },
    },
  },
};
