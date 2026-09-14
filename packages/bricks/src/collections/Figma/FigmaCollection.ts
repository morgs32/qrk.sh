import { FigmaViewForm } from "./FigmaViewForm";
import { makeViewForm } from "../../makeViewForm";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { primitives } from "@zerospin/schema";

import { makeCollection } from "../../makeCollection";
import { makeContent } from "../../makeContent";
import { FigmaThumbnailSquareSm } from "./FigmaThumbnailSquareSm";
import { FigmaThumbnailSquareXs } from "./FigmaThumbnailSquareXs";
import { makeView } from "../../makeView";
import defaultThumbnailUrl from "./dot-pattern-789x450.png";

export const figmaCollection = makeCollection({
  collectionName: "figma",
  collectionLabel: "Figma",
  collectionDescription: "Live previews for Figma files, boards, slides, and prototypes.",
  contents: {
    thumbnail: makeContent({
      content: "thumbnail",
      contentName: "Thumbnail",
      contentDescription: "The thumbnail of a Figma file, board, slides deck, or prototype.",
      configuration: makeFetcherConfiguration({
        contentOptionsShape: {
          url: primitives.text({
            defaultValue: "",
          }),
        },
        fetcher: async ({ api, contentOptions, setData }) => {
          const result = await api.figmaRepo().getThumbnail(contentOptions.url);
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
        thumbnail_url: defaultThumbnailUrl,
        thumbnail_width: 789,
        thumbnail_height: 450,
      },
      views: {
        "4x4": makeView({
          id: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          form: makeViewForm({
            shape: {
              imagePosition: primitives.enum({
                values: ["center", "left", "right", "top", "bottom"],
                defaultValue: "center",
              }),
            },
            form: FigmaViewForm,
          }),
          xs: FigmaThumbnailSquareXs,
          sm: FigmaThumbnailSquareSm,
        }),
      },
    }),
  },
});
