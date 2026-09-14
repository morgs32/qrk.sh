import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { primitives } from "@zerospin/schema";

import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { makeBrick } from "../../makeBrick";
import { FigmaThumbnail4x4 } from "./FigmaThumbnail4x4";

export const figmaCollection = makeCollection({
  collectionName: "figma",
  collectionLabel: "Figma",
  collectionDescription: "Live previews for Figma files, boards, slides, and prototypes.",
  variants: {
    thumbnail: makeVariant({
      variant: "thumbnail",
      variantName: "Thumbnail",
      variantDescription: "The thumbnail of a Figma file, board, slides deck, or prototype.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text({
            defaultValue: "",
          }),
        },
        fetcher: async ({ api, payload, setData }) => {
          const result = await api.figmaRepo().getThumbnail(payload.url);
          if (result._tag === "Left") return result;
          setData(result.right);
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        title: primitives.text(),
        url: primitives.text(),
        thumbnail_url: primitives.text({ nullable: true }),
        thumbnail_width: primitives.integer({ nullable: true }),
        thumbnail_height: primitives.integer({ nullable: true }),
      },
      defaultData: {
        title: "Figma Thumbnail",
        url: "",
        thumbnail_url: null,
        thumbnail_width: null,
        thumbnail_height: null,
      },
      layouts: {
        "4x4": makeBrick({
          variant: "thumbnail",
          layout: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: FigmaThumbnail4x4,
        }),
      },
    }),
  },
});
