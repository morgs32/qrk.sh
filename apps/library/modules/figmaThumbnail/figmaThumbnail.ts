import { primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { defineModule } from "../../make/defineModule";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { defaultSpec } from "./generative/defaultSpec";
import { figmaCardComponent } from "./generative/FigmaCardComponent";
import { figmaMediaFooterComponent } from "./generative/FigmaMediaFooterComponent";
import { figmaThumbnailBandComponent } from "./generative/FigmaThumbnailBandComponent";

export const figmaThumbnail = defineModule({
  id: "figma-thumbnail",
  label: "Figma Thumbnail",
  description: "The thumbnail of a Figma file, board, slides deck, or prototype.",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    FigmaCard: figmaCardComponent,
    FigmaThumbnailBand: figmaThumbnailBandComponent,
    FigmaMediaFooter: figmaMediaFooterComponent,
  },
  data: makeDataFetcher({
    payloadShape: {
      url: primitives.text({
        defaultValue: "",
      }),
    },
    fetcher: async ({ api, payload, setData }) => {
      const result = await api.figmaBackend().getThumbnail(payload.url);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    },
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
      thumbnail_width: 789,
      thumbnail_height: 450,
    },
  }),
  breakpoints: {
    sm: {
      defaultSpec,
      options: {
        shape: {
          imagePosition: primitives.enum({
            values: ["center", "left", "right", "top", "bottom"],
            defaultValue: "left",
          }),
        },
      },
    },
  },
});
