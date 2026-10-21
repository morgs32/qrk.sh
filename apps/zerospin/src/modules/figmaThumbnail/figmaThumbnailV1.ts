import { defaultSpec } from "./generator/defaultSpec";

import { Schema } from "effect";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../lib/jsonRender/layoutComponents";

import { makeModuleVersion } from "../make/makeModuleVersion";

import { figmaThumbnail } from "./figmaThumbnail";

import { figmaCardComponent } from "./generator/FigmaCardComponent";

import { figmaMediaFooterComponent } from "./generator/FigmaMediaFooterComponent";

import { figmaThumbnailBandComponent } from "./generator/FigmaThumbnailBandComponent";

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
  version: 1,
  defaultSpec,
  hasPlaceholder: true,
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
    data: primitives.json({ nullable: true, schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { url: "" },
    data: defaultData,
  },
});
