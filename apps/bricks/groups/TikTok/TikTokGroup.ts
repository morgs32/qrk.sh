import { primitives } from "@zerospin/schema";

import { makeGroup } from "../../makeGroup";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeCatalog } from "../../makeCatalog";

import { TikTokDefault4x4 } from "./catalogs/default/TikTokDefault4x4";

export const tikTokGroup = makeGroup({
  groupName: "tiktok",
  groupLabel: "TikTok",
  groupDescription: "TikTok's official creator profile embed with recent videos.",
  catalogs: {
    default: makeCatalog({
      catalog: "default",
      catalogName: "Default",
      catalogDescription: "TikTok's tokenless creator profile embed.",
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
      xs: { component: TikTokDefault4x4, w: 4, h: 4 },
    }),
  },
});
