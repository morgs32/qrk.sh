import { createElement } from "react";

import { primitives } from "@zerospin/schema";

import { makeCatalog } from "../../makeCatalog";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeRegistry } from "../../makeRegistry";

import { PinkAsterisk1x1 } from "./PinkAsterisk1x1";
import { StreamlineIconLookup } from "./StreamlineIconLookup";

export const iconCatalog = makeCatalog({
  catalogName: "icon",
  catalogLabel: "Icon",
  catalogDescription: 'Graphic icons for your grid. You can never have enough "flair".',
  registries: {
    default: makeRegistry({
      registry: "default",
      registryName: "Default",
      registryDescription: "A selected icon from Streamline.",
      configuration: makeFetcherConfiguration({
        registryOptionsShape: {
          hash: primitives.text({ defaultValue: "" }),
        },
        registryOptionsForm: ({ value, onChange }) =>
          createElement(StreamlineIconLookup, {
            value: value.hash,
            onChange: (hash) => onChange({ hash }),
          }),
        fetcher: async ({ api, registryOptions, setData }) => {
          const result = await api.streamlineRepo().getSvg(registryOptions.hash);
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
      w: 2,
      h: 2,
      order: 1,
      xs: PinkAsterisk1x1,
    }),
  },
});
