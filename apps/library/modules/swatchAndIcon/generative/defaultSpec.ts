import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "swatch-1",
  elements: {
    "swatch-1": {
      type: "SwatchAndIconColor",
      props: {
        color: { $state: "/color" },
      },
      children: ["icon-1"],
    },
    "icon-1": {
      type: "IconSvgGraphic",
      props: {
        name: { $state: "/name" },
        svg: { $state: "/svg" },
      },
    },
  },
};
