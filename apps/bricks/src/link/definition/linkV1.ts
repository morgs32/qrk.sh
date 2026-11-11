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

import { linkCardComponentMetadata } from "./generator/LinkCardComponentMetadata";

import { linkCopyComponentMetadata } from "./generator/LinkCopyComponentMetadata";

import { linkHeroImageComponentMetadata } from "./generator/LinkHeroImageComponentMetadata";

import { link } from "./link";

const payloadShape = {
  url: primitives.text({
    defaultValue: "https://apps.apple.com/us/app/apple-store/id375380948",
  }),
};

const dataShape = {
  url: primitives.text(),
  title: primitives.text(),
  description: primitives.text(),
  siteName: primitives.text(),
  imageUrl: primitives.text(),
  iconUrl: primitives.text(),
};

export const linkV1 = makeModuleVersion(link, {
  version: 1,
  variants: {
    default: {
      defaultWidth: 480,
      minWidth: 320,
      defaultHeight: 180,
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
    LinkCard: linkCardComponentMetadata,
    LinkCopy: linkCopyComponentMetadata,
    LinkHeroImage: linkHeroImageComponentMetadata,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ nullable: true, schema: makeEffectSchema(dataShape) }),
  },
});
