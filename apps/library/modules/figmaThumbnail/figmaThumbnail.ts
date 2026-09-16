import { primitives } from "@zerospin/schema";

import { makeFetcherConfiguration } from "../../make/makeFetcherConfiguration";
import { makeModule } from "../../make/makeModule";
import { makeOptions } from "../../make/makeOptions";

import defaultThumbnailUrl from "./dot-pattern-789x450.png";
import { FigmaOptionsForm } from "./FigmaOptionsForm";
import { FigmaThumbnail } from "./FigmaThumbnail/FigmaThumbnail";

export const figmaThumbnail = makeModule({
  id: "figma-thumbnail",
  label: "Figma Thumbnail",
  description: "The thumbnail of a Figma file, board, slides deck, or prototype.",
  configuration: makeFetcherConfiguration({
    moduleOptionsShape: {
      url: primitives.text({
        defaultValue: ""})},
    fetcher: async ({ api, moduleOptions, setData }) => {
      const result = await api.figmaBackend().getThumbnail(moduleOptions.url);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    }}),
  dataShape: {
    title: primitives.text(),
    url: primitives.text(),
    thumbnail_url: primitives.text({ nullable: true }),
    thumbnail_width: primitives.integer({ nullable: true }),
    thumbnail_height: primitives.integer({ nullable: true })},
  defaultData: {
    title: "Figma Thumbnail",
    url: "",
    thumbnail_url: defaultThumbnailUrl,
    thumbnail_width: 789,
    thumbnail_height: 450},
  options: makeOptions({
    shape: {
      imagePosition: primitives.enum({
        values: ["center", "left", "right", "top", "bottom"],
        defaultValue: "left"})},
    form: FigmaOptionsForm}),
  sm: { component: FigmaThumbnail, w: 4, h: 4 },
  md: { component: FigmaThumbnail, w: 4, h: 4 },
  lg: { component: FigmaThumbnail, w: 3, h: 3 }});
