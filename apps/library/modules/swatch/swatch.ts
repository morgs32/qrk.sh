import { createElement } from "react";

import { primitives } from "@zerospin/schema";
import { HexColorInput, HexColorPicker } from "react-colorful";

import { makeFormConfiguration } from "../../makeFormConfiguration";
import { makeModule } from "../../makeModule";

import { SwatchDefaultFill } from "./SwatchDefaultFill";

const dataShape = { color: primitives.text() };

export const swatch = makeModule({
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
          style: { width: "100%" }}),
        createElement(HexColorInput, {
          color: data?.color ?? "#4A7C59",
          onChange: (color) => onChange({ color }),
          prefixed: true,
          "aria-label": "Hex color",
          className: "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"}),
      )}),
  id: "swatch",
  label: "Swatch",
  description: "Solid color fields for visual rhythm.",
  xs: { component: SwatchDefaultFill, w: 2, h: 2 }});
