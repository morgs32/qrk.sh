import { primitives } from "@zerospin/schema";
import { createElement } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { makeFormConfiguration } from "../../makeFormConfiguration";
import { makeView } from "../../makeView";
import { makeCatalog } from "../../makeCatalog";
import { makeContent } from "../../makeContent";
import { GreenEmpty1x1 } from "./GreenEmpty1x1";
import { GreenEmpty2x2 } from "./GreenEmpty2x2";
import { GreenEmpty4x1 } from "./GreenEmpty4x1";

const dataShape = { color: primitives.text() };

export const swatchCatalog = makeCatalog({
  catalogName: "swatch",
  catalogLabel: "Swatch",
  catalogDescription: "Solid color fields for visual rhythm.",
  contents: {
    default: makeContent({
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
      content: "default",
      contentName: "Default",
      contentDescription: "A solid color field.",
      views: {
        "2x2": makeView({
          id: "2x2",
          w: 2,
          h: 2,
          label: "2×2",
          order: 1,
          xs: GreenEmpty1x1,
        }),
        "4x4": makeView({
          id: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          xs: GreenEmpty2x2,
        }),
        "8x2": makeView({
          id: "8x2",
          w: 8,
          h: 2,
          label: "8×2",
          order: 2,
          xs: GreenEmpty4x1,
        }),
      },
    }),
  },
});
