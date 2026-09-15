import { createElement } from "react";

import { primitives } from "@zerospin/schema";
import { HexColorInput, HexColorPicker } from "react-colorful";

import { makeGroup } from "../../makeGroup";
import { makeFormConfiguration } from "../../makeFormConfiguration";
import { makeCatalog } from "../../makeCatalog";

import { SwatchDefaultFill } from "./catalogs/default/SwatchDefaultFill";

const dataShape = { color: primitives.text() };

export const swatchGroup = makeGroup({
  id: "swatch",
  label: "Swatch",
  description: "Solid color fields for visual rhythm.",
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
      id: "default",
      label: "Default",
      description: "A solid color field.",
      order: 1,
      xs: { component: SwatchDefaultFill, w: 2, h: 2 },
    }),
  },
});
