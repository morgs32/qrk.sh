import { primitives } from "@zerospin/schema";

import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeModule } from "../../makeModule";

import { InstagramDefaultFeed } from "./InstagramDefaultFeed";

export const instagram = makeModule({
  id: "instagram",
  label: "Instagram",
  description: "A public Instagram profile and its latest posts.",
  configuration: makeFetcherConfiguration({
    moduleOptionsShape: {
      url: primitives.text({
        defaultValue: "https://www.instagram.com/theonion/"})},
    fetcher: async ({ api, moduleOptions, setData }) => {
      const result = await api.instagramRepo().scrape(moduleOptions.url);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    }}),
  dataShape: {
    username: primitives.text(),
    profileImageUrl: primitives.text(),
    followersText: primitives.text(),
    postImageUrl1: primitives.text(),
    postImageUrl2: primitives.text(),
    postImageUrl3: primitives.text(),
    postImageUrl4: primitives.text()},
  defaultData: {
    username: "theonion",
    profileImageUrl:
      "https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png",
    followersText: "5M",
    postImageUrl1:
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=800&q=80",
    postImageUrl2:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
    postImageUrl3:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
    postImageUrl4:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80"},
  sm: { component: InstagramDefaultFeed, w: 6, h: 4 },
  lg: { component: InstagramDefaultFeed, w: 3, h: 3 }});
