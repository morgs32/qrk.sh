import { primitives } from "@zerospin/core/models/primitives";

import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { Link4x2 } from "./Link4x2";

export const linkCollection = makeCollection({
  collectionName: "link",
  collectionLabel: "Link",
  collectionDescription: "Rich link previews from JSON-LD and Open Graph metadata.",
  variants: {
    default: makeVariant({
      variant: "default",
      variantDescription: "A rich preview for any web link.",
      payloadShape: {
        url: primitives.text({
          defaultValue: "https://apps.apple.com/us/app/apple-store/id375380948",
        }),
      },
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
      getData: ({ api, payload }) => api.linkRepo().getPreview(payload.url),
      sizes: {
        "4x2": makeBrick({
          variant: "default",
          size: "4x2",
          w: 4,
          h: 2,
          label: "4×2",
          order: 0,
          component: Link4x2,
        }),
      },
    }),
  },
});
