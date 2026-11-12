import { defaultSpec } from "./generator/defaultSpec";

import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Schema } from "effect";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../../../definition/layoutComponentMetadata";

import { makeModuleVersion } from "../../../definition/makeModuleVersion";

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

export const completeStateSchema = Schema.toType(makeEffectSchema(articleV1.stateShape));
