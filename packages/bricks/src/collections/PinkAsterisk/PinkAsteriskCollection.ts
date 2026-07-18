import { primitives } from "@zerospin/core/models/primitives";

import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { PinkAsterisk1x1 } from "./PinkAsterisk1x1";
import { PinkAsterisk2x2 } from "./PinkAsterisk2x2";
import { PinkAsterisk4x1 } from "./PinkAsterisk4x1";
import { StreamlineIconLookup } from "./StreamlineIconLookup";

export const iconCollection = makeCollection({
  collectionName: "icon",
  collectionLabel: "Icon",
  collectionDescription: "Graphic icons for your grid.",
  variants: {
    default: makeVariant({
      variant: "default",
      variantDescription: "A selected icon from Streamline.",
      payloadShape: {
        hash: primitives.text({ defaultValue: "" }),
      },
      payloadForm: {
        hash: StreamlineIconLookup,
      },
      dataShape: {
        hash: primitives.text(),
        name: primitives.text(),
        svg: primitives.text(),
      },
      defaultData: {
        hash: "",
        name: "Asterisk",
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 20v60M20 35l60 30M20 65l60-30" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="8"/></svg>',
      },
      getData: ({ api, payload }) => api.streamlineRepo().getSvg(payload.hash),
      sizes: {
        "2x2": makeBrick({
          variant: "default",
          size: "2x2",
          w: 2,
          h: 2,
          label: "2×2",
          order: 1,
          component: PinkAsterisk1x1,
        }),
        "4x4": makeBrick({
          variant: "default",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 2,
          component: PinkAsterisk2x2,
        }),
        "8x2": makeBrick({
          variant: "default",
          size: "8x2",
          w: 8,
          h: 2,
          label: "8×2",
          order: 0,
          component: PinkAsterisk4x1,
        }),
      },
    }),
  },
});
