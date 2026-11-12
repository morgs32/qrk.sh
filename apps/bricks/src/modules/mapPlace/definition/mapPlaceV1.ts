import { normalizeMapPlaceInput } from "./normalizeMapPlaceInput";
import { defaultSpec } from "./generator/defaultSpec";

import { Schema } from "effect";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../../../definition/layoutComponentMetadata";

import { makeModuleVersion } from "../../../definition/makeModuleVersion";

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
});

export const completeStateSchema = Schema.toType(makeEffectSchema(mapPlaceV1.stateShape)).check(
  Schema.makeFilter((state) =>
    (state.data !== null && normalizeMapPlaceInput(state.payload.googlePlaceId) === state.payload.googlePlaceId) || "A configured source and content are required",
  ),
);
