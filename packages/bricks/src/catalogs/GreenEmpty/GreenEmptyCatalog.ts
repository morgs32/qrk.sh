import { createElement } from "react";

import { primitives } from "@zerospin/schema";
import { HexColorInput, HexColorPicker } from "react-colorful";

import { makeCatalog } from "../../makeCatalog";
import { makeFormConfiguration } from "../../makeFormConfiguration";
import { makeRegistry } from "../../makeRegistry";

import { GreenEmpty1x1 } from "./GreenEmpty1x1";

const dataShape = { color: primitives.text() };

export const swatchCatalog = makeCatalog({
  catalogName: "swatch",
  catalogLabel: "Swatch",
  catalogDescription: "Solid color fields for visual rhythm.",
  registries: {
    default: makeRegistry({
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
      registry: "default",
      registryName: "Default",
      registryDescription: "A solid color field.",
      w: 2,
      h: 2,
      order: 1,
      xs: GreenEmpty1x1,
    }),
  },
});
