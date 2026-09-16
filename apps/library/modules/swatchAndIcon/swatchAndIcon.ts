import { createElement } from "react";

import { primitives } from "@zerospin/schema";

import { makeFetcherConfiguration } from "../../make/makeFetcherConfiguration";
import { makeModule } from "../../make/makeModule";
import { makeBreakpointOptions } from "../../make/makeBreakpointOptions";

import { defaultSpec } from "./generative/defaultSpec";
import { registry } from "./generative/SwatchAndIconJsonRenderRegistry";
import { StreamlineIconLookup } from "./StreamlineIconLookup";
import { SwatchAndIconColorForm } from "./SwatchAndIconColorForm";

export const swatchAndIcon = makeModule({
  id: "swatch-and-icon",
  label: "Swatch and Icon",
  description: "Solid color fields with optional graphic icons for visual rhythm.",
  defaultSpec,
  registry,
  configuration: makeFetcherConfiguration({
    payloadShape: {
      hash: primitives.text({ defaultValue: "" }),
    },
    payloadForm: ({ value, onChange }) =>
      createElement(StreamlineIconLookup, {
        value: value.hash,
        onChange: (hash) => onChange({ hash }),
      }),
    fetcher: async ({ api, payload, setData }) => {
      const result = await api.streamlineBackend().getSvg(payload.hash);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    },
  }),
  dataShape: {
    name: primitives.text(),
    svg: primitives.text(),
  },
  defaultData: {
    name: "Asterisk",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 20v60M20 35l60 30M20 65l60-30" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="8"/></svg>',
  },
  breakpointOptions: makeBreakpointOptions({
    shape: {
      color: primitives.text({ defaultValue: "#4A7C59" }),
    },
    form: SwatchAndIconColorForm,
  }),
  sm: { w: 2, h: 2 },
});
