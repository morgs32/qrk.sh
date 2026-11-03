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

import { articleBrickComponentMetadata } from "./generator/ArticleBrickComponentMetadata";

import { article } from "./article";

const dataShape = {
  title: primitives.text(),
  subtitle: primitives.text(),
  content: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
};

export const articleV1 = makeModuleVersion(article, {
  version: 1,
  variants: {
    default: {
      defaultWidth: 720,
      minWidth: 320,
      defaultHeight: null,
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
    ArticleBrick: articleBrickComponentMetadata,
  },
  stateShape: dataShape,
  defaultState: {
    title: "Actually good advice",
    subtitle: "Take it or leave it",
    content: `For a long time, I’ve been collecting pieces of advice that are:

1. Applicable to anybody
2. Likely to help and unlikely to harm
3. Things I have actually tried and worked for me/things I have seen work for other people
4. Useful even without lots of context and wisdom

Here’s what I got.`,
  },
});
