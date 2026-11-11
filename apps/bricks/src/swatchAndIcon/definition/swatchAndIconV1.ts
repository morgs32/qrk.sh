import { defaultSpec } from "./generator/defaultSpec";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import { makeModuleVersion } from "../../definition/makeModuleVersion";

import { iconSvgGraphicComponentMetadata } from "./generator/IconSvgGraphicComponentMetadata";

import { swatchAndIconColorComponentMetadata } from "./generator/SwatchAndIconColorComponentMetadata";

import { swatchAndIcon } from "./swatchAndIcon";

const payloadShape = {
  hash: primitives.text({ defaultValue: "" }),
  color: primitives.text(),
};

const dataShape = {
  name: primitives.text(),
  svg: primitives.text(),
};

export const swatchAndIconV1 = makeModuleVersion(swatchAndIcon, {
  version: 1,
  variants: {
    default: {
      defaultWidth: 240,
      minWidth: 160,
      defaultHeight: 90,
    },
  },
  defaultSpec,
  hasPlaceholder: false,
  componentMetadata: {
    SwatchAndIconColor: swatchAndIconColorComponentMetadata,
    IconSvgGraphic: iconSvgGraphicComponentMetadata,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
});
