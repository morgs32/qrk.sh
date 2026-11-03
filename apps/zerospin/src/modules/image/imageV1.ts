import { defaultSpec } from "./generator/defaultSpec";

import { primitives } from "@zerospin/shapes";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../lib/jsonRender/layoutComponentMetadata";

import { makeModuleVersion } from "../make/makeModuleVersion";

import { imageCardComponentMetadata } from "./generator/ImageCardComponentMetadata";

import { imageCoverComponentMetadata } from "./generator/ImageCoverComponentMetadata";

import { mediaFooterComponentMetadata } from "./generator/MediaFooterComponentMetadata";

import { image } from "./image";

const dataShape = {
  imageUrl: primitives.text(),
  title: primitives.text(),
};

const defaultData = {
  imageUrl:
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
  title: "White Bay Power Station",
};

export const imageV1 = makeModuleVersion(image, {
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
    ImageCard: imageCardComponentMetadata,
    ImageCover: imageCoverComponentMetadata,
    MediaFooter: mediaFooterComponentMetadata,
  },
  stateShape: dataShape,
  defaultState: defaultData,
});
