import { primitives } from "@zerospin/schema";

import { defineModule } from "../../make/defineModule";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { swatchAndIconJsonRenderCatalog } from "./generative/SwatchAndIconJsonRenderCatalog";
import { defaultSpec } from "./generative/defaultSpec";

export const swatchAndIcon = defineModule({
  id: "swatch-and-icon",
  label: "Swatch and Icon",
  description: "Solid color fields with optional graphic icons for visual rhythm.",
  catalog: swatchAndIconJsonRenderCatalog,
  data: makeDataFetcher({
    payloadShape: {
      hash: primitives.text({ defaultValue: "" }),
    },
    fetcher: async ({ api, payload, setData }) => {
      const result = await api.streamlineBackend().getSvg(payload.hash);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    },
    dataShape: {
      name: primitives.text(),
      svg: primitives.text(),
    },
    defaultData: {
      name: "Asterisk",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 20v60M20 35l60 30M20 65l60-30" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="8"/></svg>',
    },
  }),
  breakpoints: {
    sm: {
      w: 2,
      h: 2,
      measurable: true,
      defaultSpec,
      options: { shape: { color: primitives.text({ defaultValue: "#4A7C59" }) } },
    },
  },
});
