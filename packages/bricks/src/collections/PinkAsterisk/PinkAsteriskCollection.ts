import { createElement } from "react";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { primitives } from "@zerospin/schema";

import { makeView } from "../../makeView";
import { makeCollection } from "../../makeCollection";
import { makeContent } from "../../makeContent";
import { PinkAsterisk1x1 } from "./PinkAsterisk1x1";
import { PinkAsterisk2x2 } from "./PinkAsterisk2x2";
import { PinkAsterisk4x1 } from "./PinkAsterisk4x1";
import { StreamlineIconLookup } from "./StreamlineIconLookup";

export const iconCollection = makeCollection({
  collectionName: "icon",
  collectionLabel: "Icon",
  collectionDescription: 'Graphic icons for your grid. You can never have enough "flair".',
  contents: {
    default: makeContent({
      content: "default",
      contentName: "Default",
      contentDescription: "A selected icon from Streamline.",
      configuration: makeFetcherConfiguration({
        contentOptionsShape: {
          hash: primitives.text({ defaultValue: "" }),
        },
        contentOptionsForm: ({ value, onChange }) =>
          createElement(StreamlineIconLookup, {
            value: value.hash,
            onChange: (hash) => onChange({ hash }),
          }),
        fetcher: async ({ api, contentOptions, setData }) => {
          const result = await api.streamlineRepo().getSvg(contentOptions.hash);
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
      views: {
        "2x2": makeView({
          id: "2x2",
          w: 2,
          h: 2,
          label: "2×2",
          order: 1,
          xs: PinkAsterisk1x1,
        }),
        "4x4": makeView({
          id: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 2,
          xs: PinkAsterisk2x2,
        }),
        "8x2": makeView({
          id: "8x2",
          w: 8,
          h: 2,
          label: "8×2",
          order: 0,
          xs: PinkAsterisk4x1,
        }),
      },
    }),
  },
});
