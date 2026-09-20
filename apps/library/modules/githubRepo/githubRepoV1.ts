import { makeEffectSchema, primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { repoDescriptionComponent } from "./generator/RepoDescriptionComponent";
import { repoForksComponent } from "./generator/RepoForksComponent";
import { repoLanguageComponent } from "./generator/RepoLanguageComponent";
import { repoNameComponent } from "./generator/RepoNameComponent";
import { repoStarsComponent } from "./generator/RepoStarsComponent";
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

const defaultData = {
  name: "ink-steps",
  description: "A sample GitHub repository card.",
  stargazers_count: 12,
  forks_count: 3,
  language: "TypeScript",
};

export const githubRepoV1 = makeModuleVersion(githubRepo, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    RepoName: repoNameComponent,
    RepoDescription: repoDescriptionComponent,
    RepoStars: repoStarsComponent,
    RepoForks: repoForksComponent,
    RepoLanguage: repoLanguageComponent,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { url: "https://github.com/morgs32/ink-steps" },
    data: defaultData,
  },
});
