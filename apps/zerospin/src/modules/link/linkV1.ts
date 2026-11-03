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

const defaultData = {
  url: "https://apps.apple.com/",
  title: "Celebrate our birthday & get Pro free for one year",
  description: "Hmm a brief description of the link",
  siteName: "apps.apple.com",
  imageUrl:
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80",
  iconUrl: "https://www.apple.com/favicon.ico",
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
  defaultState: {
    payload: { url: "https://apps.apple.com/us/app/apple-store/id375380948" },
    data: defaultData,
  },
});
