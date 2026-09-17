/*
fetcher: async ({ api, payload, setData }) => {
  const result = await api.githubBackend().getRepo(payload.url);
  if (result._tag === "Left") return result;
  setData(result.right);
  return { _tag: "Right", right: undefined };
},
*/

import { makeEffectSchema, primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { defaultSpec } from "./generative/defaultSpec";
import { repoDescriptionComponent } from "./generative/RepoDescriptionComponent";
import { repoForksComponent } from "./generative/RepoForksComponent";
import { repoLanguageComponent } from "./generative/RepoLanguageComponent";
import { repoNameComponent } from "./generative/RepoNameComponent";
import { repoStarsComponent } from "./generative/RepoStarsComponent";
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
  data: makeDataFetcher({
    payloadShape,
    dataShape,
    defaultData,
  }),
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { url: "https://github.com/morgs32/ink-steps" },
    data: defaultData,
  },
  breakpoints: {
    sm: { defaultSpec },
  },
});
