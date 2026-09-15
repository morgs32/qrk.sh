import { createElement } from "react";

import { primitives } from "@zerospin/schema";

import { makeGroup } from "../../makeGroup";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeCatalog } from "../../makeCatalog";

import { IconDefaultGlyph } from "./catalogs/default/IconDefaultGlyph";
import { StreamlineIconLookup } from "./catalogs/default/StreamlineIconLookup";

export const iconGroup = makeGroup({
  id: "icon",
  label: "Icon",
  description: 'Graphic icons for your grid. You can never have enough "flair".',
  catalogs: {
    default: makeCatalog({
      id: "default",
      label: "Default",
      description: "A selected icon from Streamline.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          hash: primitives.text({ defaultValue: "" }),
        },
        catalogOptionsForm: ({ value, onChange }) =>
          createElement(StreamlineIconLookup, {
            value: value.hash,
            onChange: (hash) => onChange({ hash }),
          }),
        fetcher: async ({ api, catalogOptions, setData }) => {
          const result = await api.streamlineRepo().getSvg(catalogOptions.hash);
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
      order: 1,
      xs: { component: IconDefaultGlyph, w: 2, h: 2 },
    }),
  },
});
