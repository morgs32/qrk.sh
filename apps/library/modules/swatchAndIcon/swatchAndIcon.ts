import { createElement } from "react";

import { primitives } from "@zerospin/schema";

import { makeFetcherConfiguration } from "../../make/makeFetcherConfiguration";
import { makeModule } from "../../make/makeModule";
import { makeOptions } from "../../make/makeOptions";

import { StreamlineIconLookup } from "./StreamlineIconLookup";
import { SwatchAndIconColorForm } from "./SwatchAndIconColorForm";
import { SwatchAndIcon } from "./SwatchAndIcon/SwatchAndIcon";

export const swatchAndIcon = makeModule({
  id: "swatch-and-icon",
  label: "Swatch and Icon",
  description: "Solid color fields with optional graphic icons for visual rhythm.",
  configuration: makeFetcherConfiguration({
    moduleOptionsShape: {
      hash: primitives.text({ defaultValue: "" })},
    moduleOptionsForm: ({ value, onChange }) =>
      createElement(StreamlineIconLookup, {
        value: value.hash,
        onChange: (hash) => onChange({ hash })}),
    fetcher: async ({ api, moduleOptions, setData }) => {
      const result = await api.streamlineBackend().getSvg(moduleOptions.hash);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    }}),
  dataShape: {
    name: primitives.text(),
    svg: primitives.text()},
  defaultData: {
    name: "Asterisk",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 20v60M20 35l60 30M20 65l60-30" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="8"/></svg>'},
  options: makeOptions({
    shape: {
      color: primitives.text({ defaultValue: "#4A7C59" })},
    form: SwatchAndIconColorForm}),
  sm: { component: SwatchAndIcon, w: 2, h: 2 }});
