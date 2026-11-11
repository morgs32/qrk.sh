import { defaultSpec } from "./generator/defaultSpec";

import { Schema } from "effect";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../jsonRender/layoutComponentMetadata";

import { makeModuleVersion } from "../make/makeModuleVersion";

import { repoDescriptionComponentMetadata } from "./generator/RepoDescriptionComponentMetadata";

import { repoForksComponentMetadata } from "./generator/RepoForksComponentMetadata";

import { repoLanguageComponentMetadata } from "./generator/RepoLanguageComponentMetadata";

import { repoNameComponentMetadata } from "./generator/RepoNameComponentMetadata";

import { repoStarsComponentMetadata } from "./generator/RepoStarsComponentMetadata";

import { githubRepo } from "./githubRepo";

const payloadShape = {
  url: primitives.text({ defaultValue: "https://github.com/morgs32/ink-steps" }),
};

const dataShape = {
  name: primitives.text(),
  description: primitives.text({ nullable: true }),
  stargazers_count: primitives.integer(),
  forks_count: primitives.integer(),
  language: primitives.text({ nullable: true }),
};

export const githubRepoV1 = makeModuleVersion(githubRepo, {
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
    RepoName: repoNameComponentMetadata,
    RepoDescription: repoDescriptionComponentMetadata,
    RepoStars: repoStarsComponentMetadata,
    RepoForks: repoForksComponentMetadata,
    RepoLanguage: repoLanguageComponentMetadata,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ nullable: true, schema: makeEffectSchema(dataShape) }),
  },
});
