import { defaultSpec } from "./generator/defaultSpec";

import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Schema } from "effect";

import { makeModuleVersion } from "../../../definition/makeModuleVersion";

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

export const completeStateSchema = Schema.toType(makeEffectSchema(swatchAndIconV1.stateShape)).check(
  Schema.makeFilter(({ payload, data }) =>
    (/^#?(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(payload.color) &&
      data.name.trim().length > 0 &&
      data.svg.trim().length > 0) ||
    "A valid color and icon are required",
  ),
);
