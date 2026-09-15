import { primitives } from "@zerospin/schema";

import { makeGroup } from "../../makeGroup";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeCatalog } from "../../makeCatalog";

import { Link4x2 } from "./catalogs/default/Link4x2";

export const linkGroup = makeGroup({
  groupName: "link",
  groupLabel: "Link",
  groupDescription: "Rich link previews from JSON-LD and Open Graph metadata.",
  catalogs: {
    default: makeCatalog({
      catalog: "default",
      catalogName: "Default",
      catalogDescription: "A rich preview for any web link.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          url: primitives.text({
            defaultValue: "https://apps.apple.com/us/app/apple-store/id375380948",
          }),
        },
        fetcher: async ({ api, catalogOptions, setData }) => {
          const result = await api.linkRepo().getPreview(catalogOptions.url);
          if (result._tag === "Left") return result;
          setData(result.right);
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        url: primitives.text(),
        title: primitives.text(),
        description: primitives.text(),
        siteName: primitives.text(),
        imageUrl: primitives.text(),
        iconUrl: primitives.text(),
      },
      defaultData: {
        url: "https://apps.apple.com/",
        title: "Celebrate our birthday & get Pro free for one year",
        description: "",
        siteName: "apps.apple.com",
        imageUrl:
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80",
        iconUrl: "https://www.apple.com/favicon.ico",
      },
      order: 0,
      xs: { component: Link4x2, w: 4, h: 2 },
    }),
  },
});
