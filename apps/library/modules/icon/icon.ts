import { createElement } from "react";

import { primitives } from "@zerospin/schema";

import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeModule } from "../../makeModule";

import { IconDefaultGlyph } from "./IconDefaultGlyph";
import { StreamlineIconLookup } from "./StreamlineIconLookup";

export const icon = makeModule({
  id: "icon",
  label: "Icon",
  description: 'Graphic icons for your grid. You can never have enough "flair".',
  configuration: makeFetcherConfiguration({
    moduleOptionsShape: {
      hash: primitives.text({ defaultValue: "" })},
    moduleOptionsForm: ({ value, onChange }) =>
      createElement(StreamlineIconLookup, {
        value: value.hash,
        onChange: (hash) => onChange({ hash })}),
    fetcher: async ({ api, moduleOptions, setData }) => {
      const result = await api.streamlineRepo().getSvg(moduleOptions.hash);
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
  sm: { component: IconDefaultGlyph, w: 2, h: 2 }});
