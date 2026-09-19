import { makeEffectSchema, primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { figmaThumbnail } from "./figmaThumbnail";
import { figmaCardComponent } from "./generative/FigmaCardComponent";
import { figmaMediaFooterComponent } from "./generative/FigmaMediaFooterComponent";
import { figmaThumbnailBandComponent } from "./generative/FigmaThumbnailBandComponent";

const payloadShape = {
  url: primitives.text({
    defaultValue: "",
  }),
};

const dataShape = {
  title: primitives.text(),
  url: primitives.text(),
  thumbnail_url: primitives.text({ nullable: true }),
  thumbnail_width: primitives.integer({ nullable: true }),
  thumbnail_height: primitives.integer({ nullable: true }),
};

const defaultData = {
  title: "Figma Thumbnail",
  url: "",
  thumbnail_url: null,
  thumbnail_width: 789,
  thumbnail_height: 450,
};

export const figmaThumbnailV1 = makeModuleVersion(figmaThumbnail, {
  version: "1.0.0",
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
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { url: "" },
    data: defaultData,
  },
});
