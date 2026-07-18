import { primitives } from "@zerospin/core/models/primitives";

import { makeCollection } from "../../makeCollection";
import { makeBrick } from "../../makeBrick";
import { makeVariant } from "../../makeVariant";
import { TikTokDefault4x4 } from "./TikTokDefault4x4";

export const tikTokCollection = makeCollection({
  collectionName: "tiktok",
  collectionLabel: "TikTok",
  collectionDescription: "TikTok's official creator profile embed with recent videos.",
  variants: {
    default: makeVariant({
      variant: "default",
      variantDescription: "TikTok's tokenless creator profile embed.",
      payloadShape: {
        url: primitives.text({ defaultValue: "https://www.tiktok.com/@theonion" }),
      },
      dataShape: {
        username: primitives.text(),
      },
      defaultData: {
        username: "theonion",
      },
      getData: ({ api, payload }) => api.tiktokRepo().scrape(payload.url),
      sizes: {
        "4x4": makeBrick({
          variant: "default",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: TikTokDefault4x4,
        }),
      },
    }),
  },
});
