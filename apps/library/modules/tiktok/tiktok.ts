import { primitives } from "@zerospin/schema";

import { makeFetcherConfiguration } from "../../make/makeFetcherConfiguration";
import { makeModule } from "../../make/makeModule";

import { TikTokDefaultEmbed } from "./TikTokDefaultEmbed";

export const tiktok = makeModule({
  id: "tiktok",
  label: "TikTok",
  description: "TikTok's official creator profile embed with recent videos.",
  configuration: makeFetcherConfiguration({
    moduleOptionsShape: {
      url: primitives.text({
        defaultValue: "https://www.tiktok.com/@theonion"})},
    fetcher: async ({ api, moduleOptions, setData }) => {
      const result = await api.tiktokRepo().scrape(moduleOptions.url);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    }}),
  dataShape: {
    username: primitives.text()},
  defaultData: {
    username: "theonion"},
  sm: { component: TikTokDefaultEmbed, w: 4, h: 4 }});
