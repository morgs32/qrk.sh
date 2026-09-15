import { primitives } from "@zerospin/schema";

import { makeAppearanceForm } from "../../makeAppearanceForm";
import { makeGroup } from "../../makeGroup";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeCatalog } from "../../makeCatalog";

import defaultThumbnailUrl from "./catalogs/thumbnail/dot-pattern-789x450.png";
import { FigmaAppearanceForm } from "./catalogs/thumbnail/FigmaAppearanceForm";
import { FigmaThumbnailFooter } from "./catalogs/thumbnail/FigmaThumbnailFooter";
import { FigmaThumbnailHeader } from "./catalogs/thumbnail/FigmaThumbnailHeader";

export const figmaGroup = makeGroup({
  id: "figma",
  label: "Figma",
  description: "Live previews for Figma files, boards, slides, and prototypes.",
  catalogs: {
    thumbnail: makeCatalog({
      id: "thumbnail",
      label: "Thumbnail",
      description: "The thumbnail of a Figma file, board, slides deck, or prototype.",
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
      xs: { component: FigmaThumbnailHeader, w: 4, h: 4 },
      sm: { component: FigmaThumbnailFooter, w: 4, h: 4 },
    }),
  },
});
