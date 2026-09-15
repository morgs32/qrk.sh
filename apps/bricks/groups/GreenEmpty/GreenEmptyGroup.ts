import { createElement } from "react";

import { primitives } from "@zerospin/schema";
import { HexColorInput, HexColorPicker } from "react-colorful";

import { makeGroup } from "../../makeGroup";
import { makeFormConfiguration } from "../../makeFormConfiguration";
import { makeCatalog } from "../../makeCatalog";

import { GreenEmpty1x1 } from "./catalogs/default/GreenEmpty1x1";

const dataShape = { color: primitives.text() };

export const swatchGroup = makeGroup({
  groupName: "swatch",
  groupLabel: "Swatch",
  groupDescription: "Solid color fields for visual rhythm.",
  catalogs: {
    default: makeCatalog({
      dataShape,
      defaultData: { color: "#4A7C59" },
      configuration: makeFormConfiguration<typeof dataShape>({
        form: ({ data, onChange }) =>
          createElement(
            "div",
            { className: "space-y-4" },
            createElement(HexColorPicker, {
              color: data?.color ?? "#4A7C59",
              onChange: (color) => onChange({ color }),
              style: { width: "100%" },
            }),
            createElement(HexColorInput, {
              color: data?.color ?? "#4A7C59",
              onChange: (color) => onChange({ color }),
              prefixed: true,
              "aria-label": "Hex color",
              className:
                "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm",
            }),
          ),
      }),
      catalog: "default",
      catalogName: "Default",
      catalogDescription: "A solid color field.",
      order: 1,
      xs: { component: GreenEmpty1x1, w: 2, h: 2 },
    }),
  },
});
