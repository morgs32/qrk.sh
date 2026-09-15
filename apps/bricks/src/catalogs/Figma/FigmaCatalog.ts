import { primitives } from "@zerospin/schema";

import { makeAppearanceForm } from "../../makeAppearanceForm";
import { makeCatalog } from "../../makeCatalog";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeRegistry } from "../../makeRegistry";

import defaultThumbnailUrl from "./dot-pattern-789x450.png";
import { FigmaAppearanceForm } from "./FigmaAppearanceForm";
import { FigmaThumbnailSquareSm } from "./FigmaThumbnailSquareSm";
import { FigmaThumbnailSquareXs } from "./FigmaThumbnailSquareXs";

export const figmaCatalog = makeCatalog({
  catalogName: "figma",
  catalogLabel: "Figma",
  catalogDescription: "Live previews for Figma files, boards, slides, and prototypes.",
  registries: {
    thumbnail: makeRegistry({
      registry: "thumbnail",
      registryName: "Thumbnail",
      registryDescription: "The thumbnail of a Figma file, board, slides deck, or prototype.",
      configuration: makeFetcherConfiguration({
        registryOptionsShape: {
          url: primitives.text({
            defaultValue: "",
          }),
        },
        fetcher: async ({ api, registryOptions, setData }) => {
          const result = await api.figmaRepo().getThumbnail(registryOptions.url);
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
