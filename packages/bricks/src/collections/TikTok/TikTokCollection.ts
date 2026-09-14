import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { primitives } from "@zerospin/schema";

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
      variantLabel: "Default",
      variantDescription: "TikTok's tokenless creator profile embed.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text({ defaultValue: "https://www.tiktok.com/@theonion" }),
        },
        fetcher: async ({ api, payload, setData }) => {
          const result = await api.tiktokRepo().scrape(payload.url);
          if (result._tag === "Left") return result;
          setData(result.right);
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        username: primitives.text(),
      },
      defaultData: {
        username: "theonion",
      },
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
