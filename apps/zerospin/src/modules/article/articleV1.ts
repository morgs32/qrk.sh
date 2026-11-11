import { defaultSpec } from "./generator/defaultSpec";

import { primitives } from "@zerospin/shapes";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../../jsonRender/layoutComponentMetadata";

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
});
