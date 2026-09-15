import { primitives } from "@zerospin/schema";

import { makeCatalog } from "../../makeCatalog";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeRegistry } from "../../makeRegistry";

import { TikTokDefault4x4 } from "./TikTokDefault4x4";

export const tikTokCatalog = makeCatalog({
  catalogName: "tiktok",
  catalogLabel: "TikTok",
  catalogDescription: "TikTok's official creator profile embed with recent videos.",
  registries: {
    default: makeRegistry({
      registry: "default",
      registryName: "Default",
      registryDescription: "TikTok's tokenless creator profile embed.",
      configuration: makeFetcherConfiguration({
        registryOptionsShape: {
          url: primitives.text({
            defaultValue: "https://www.tiktok.com/@theonion",
          }),
        },
        fetcher: async ({ api, registryOptions, setData }) => {
          const result = await api.tiktokRepo().scrape(registryOptions.url);
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
      w: 4,
      h: 4,
      order: 0,
      xs: TikTokDefault4x4,
    }),
  },
});
