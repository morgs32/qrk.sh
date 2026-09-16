import { primitives } from "@zerospin/schema";

import { makeFetcherConfiguration } from "../../make/makeFetcherConfiguration";
import { makeModule } from "../../make/makeModule";
import { makeBreakpointOptions } from "../../make/makeBreakpointOptions";

import defaultThumbnailUrl from "./dot-pattern-789x450.png";
import { FigmaBreakpointOptionsForm } from "./FigmaBreakpointOptionsForm";
import { defaultSpec } from "./generative/defaultSpec";
import { registry } from "./generative/FigmaThumbnailJsonRenderRegistry";

export const figmaThumbnail = makeModule({
  id: "figma-thumbnail",
  label: "Figma Thumbnail",
  description: "The thumbnail of a Figma file, board, slides deck, or prototype.",
  defaultSpec,
  registry,
  configuration: makeFetcherConfiguration({
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
  breakpointOptions: makeBreakpointOptions({
    shape: {
      imagePosition: primitives.enum({
        values: ["center", "left", "right", "top", "bottom"],
        defaultValue: "left",
      }),
    },
    form: FigmaBreakpointOptionsForm,
  }),
  sm: { w: 4, h: 4 },
  md: { w: 4, h: 4 },
  lg: { w: 3, h: 3 },
});
