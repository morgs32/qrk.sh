import { primitives } from "@zerospin/schema";

import { makeGroup } from "../../makeGroup";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeCatalog } from "../../makeCatalog";

import { TikTokDefaultEmbed } from "./catalogs/default/TikTokDefaultEmbed";

export const tikTokGroup = makeGroup({
  id: "tiktok",
  label: "TikTok",
  description: "TikTok's official creator profile embed with recent videos.",
  catalogs: {
    default: makeCatalog({
      id: "default",
      label: "Default",
      description: "TikTok's tokenless creator profile embed.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          url: primitives.text({
            defaultValue: "https://www.tiktok.com/@theonion",
          }),
        },
        fetcher: async ({ api, catalogOptions, setData }) => {
          const result = await api.tiktokRepo().scrape(catalogOptions.url);
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
      order: 0,
      xs: { component: TikTokDefaultEmbed, w: 4, h: 4 },
    }),
  },
});
