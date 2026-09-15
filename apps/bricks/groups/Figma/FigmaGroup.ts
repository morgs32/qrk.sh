import { primitives } from "@zerospin/schema";

import { makeAppearanceForm } from "../../makeAppearanceForm";
import { makeGroup } from "../../makeGroup";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeCatalog } from "../../makeCatalog";

import defaultThumbnailUrl from "./catalogs/thumbnail/dot-pattern-789x450.png";
import { FigmaAppearanceForm } from "./catalogs/thumbnail/FigmaAppearanceForm";
import { FigmaThumbnailSquareSm } from "./catalogs/thumbnail/FigmaThumbnailSquareSm";
import { FigmaThumbnailSquareXs } from "./catalogs/thumbnail/FigmaThumbnailSquareXs";

export const figmaGroup = makeGroup({
  groupName: "figma",
  groupLabel: "Figma",
  groupDescription: "Live previews for Figma files, boards, slides, and prototypes.",
  catalogs: {
    thumbnail: makeCatalog({
      catalog: "thumbnail",
      catalogName: "Thumbnail",
      catalogDescription: "The thumbnail of a Figma file, board, slides deck, or prototype.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          url: primitives.text({
            defaultValue: "",
          }),
        },
        fetcher: async ({ api, catalogOptions, setData }) => {
          const result = await api.figmaRepo().getThumbnail(catalogOptions.url);
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
      order: 0,
      form: makeAppearanceForm({
        shape: {
          imagePosition: primitives.enum({
            values: ["center", "left", "right", "top", "bottom"],
            defaultValue: "center",
          }),
        },
        form: FigmaAppearanceForm,
      }),
      xs: { component: FigmaThumbnailSquareXs, w: 4, h: 4 },
      sm: { component: FigmaThumbnailSquareSm, w: 4, h: 4 },
    }),
  },
});
