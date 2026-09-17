import { primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { defineModule } from "../../make/defineModule";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { defaultSpec } from "./generative/defaultSpec";
import { repoDescriptionComponent } from "./generative/RepoDescriptionComponent";
import { repoForksComponent } from "./generative/RepoForksComponent";
import { repoLanguageComponent } from "./generative/RepoLanguageComponent";
import { repoNameComponent } from "./generative/RepoNameComponent";
import { repoStarsComponent } from "./generative/RepoStarsComponent";

export const githubRepo = defineModule({
  id: "github-repo",
  label: "GitHub Repo",
  description: "A GitHub repository card.",
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
    payloadShape: {
      url: primitives.text({ defaultValue: "https://github.com/morgs32/ink-steps" }),
    },
    fetcher: async ({ api, payload, setData }) => {
      const result = await api.githubBackend().getRepo(payload.url);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    },
    dataShape: {
      name: primitives.text(),
      description: primitives.text({ nullable: true }),
      stargazers_count: primitives.integer(),
      forks_count: primitives.integer(),
      language: primitives.text({ nullable: true }),
    },
    defaultData: {
      name: "ink-steps",
      description: "A sample GitHub repository card.",
      stargazers_count: 12,
      forks_count: 3,
      language: "TypeScript",
    },
  }),
  breakpoints: {
    sm: { defaultSpec },
  },
});
