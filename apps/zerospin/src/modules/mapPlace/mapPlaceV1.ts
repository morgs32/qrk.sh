import { defaultSpec } from "./generator/defaultSpec";

import { Schema } from "effect";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../lib/jsonRender/layoutComponentMetadata";

import { makeModuleVersion } from "../make/makeModuleVersion";

import { mapCanvasComponentMetadata } from "./generator/MapCanvasComponentMetadata";

import { mapPlace } from "./mapPlace";

const payloadShape = {
  googlePlaceId: primitives.text({
    defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
  }),
};

const dataShape = {
  googlePlaceId: primitives.text(),
  name: primitives.text(),
  address: primitives.text(),
  latitude: primitives.number(),
  longitude: primitives.number(),
};

const defaultData = {
  googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
  name: "Downtown Chicago",
  address: "Chicago, IL, USA",
  latitude: 41.8781136,
  longitude: -87.6297982,
};

export const mapPlaceV1 = makeModuleVersion(mapPlace, {
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
    MapCanvas: mapCanvasComponentMetadata,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ nullable: true, schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8" },
    data: defaultData,
  },
});
