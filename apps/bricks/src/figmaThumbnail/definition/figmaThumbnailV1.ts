import { defaultSpec } from "./generator/defaultSpec";

import { Schema } from "effect";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../../definition/layoutComponentMetadata";

import { makeModuleVersion } from "../../definition/makeModuleVersion";

import { figmaThumbnail } from "./figmaThumbnail";

import { figmaCardComponentMetadata } from "./generator/FigmaCardComponentMetadata";

import { figmaMediaFooterComponentMetadata } from "./generator/FigmaMediaFooterComponentMetadata";

import { figmaThumbnailBandComponentMetadata } from "./generator/FigmaThumbnailBandComponentMetadata";

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

export const figmaThumbnailV1 = makeModuleVersion(figmaThumbnail, {
  version: 1,
  variants: {
    default: {
      defaultWidth: 480,
      minWidth: 320,
      defaultHeight: 360,
    },
  },
  defaultSpec,
  hasPlaceholder: true,
  componentMetadata: {
    BrickShell: brickShellComponentMetadata,
    BrickBody: brickBodyComponentMetadata,
    BrickFooter: brickFooterComponentMetadata,
    Column: columnComponentMetadata,
    Row: rowComponentMetadata,
    FigmaCard: figmaCardComponentMetadata,
    FigmaThumbnailBand: figmaThumbnailBandComponentMetadata,
    FigmaMediaFooter: figmaMediaFooterComponentMetadata,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ nullable: true, schema: makeEffectSchema(dataShape) }),
  },
});
