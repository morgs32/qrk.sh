import { primitives } from "@zerospin/schema";

import { makeAppearanceForm } from "../../makeAppearanceForm";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeModule } from "../../makeModule";

import defaultThumbnailUrl from "./dot-pattern-789x450.png";
import { FigmaAppearanceForm } from "./FigmaAppearanceForm";
import { FigmaThumbnailFooter } from "./FigmaThumbnailFooter";
import { FigmaThumbnailHeader } from "./FigmaThumbnailHeader";

export const figmaThumbnail = makeModule({
  id: "figma-thumbnail",
  label: "Figma Thumbnail",
  description: "The thumbnail of a Figma file, board, slides deck, or prototype.",
  configuration: makeFetcherConfiguration({
    moduleOptionsShape: {
      url: primitives.text({
        defaultValue: ""})},
    fetcher: async ({ api, moduleOptions, setData }) => {
      const result = await api.figmaRepo().getThumbnail(moduleOptions.url);
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
  order: 0,
  form: makeAppearanceForm({
    shape: {
      imagePosition: primitives.enum({
        values: ["center", "left", "right", "top", "bottom"],
        defaultValue: "center"})},
    form: FigmaAppearanceForm}),
  xs: { component: FigmaThumbnailHeader, w: 4, h: 4 },
  sm: { component: FigmaThumbnailFooter, w: 4, h: 4 }});
