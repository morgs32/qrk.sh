import { primitives } from "@zerospin/schema";

import { defineModule } from "../../make/defineModule";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { defaultSpec } from "./generative/defaultSpec";
import { githubRepoJsonRenderCatalog } from "./generative/GitHubRepoJsonRenderCatalog";

export const githubRepo = defineModule({
  id: "github-repo",
  label: "GitHub Repo",
  description: "A GitHub repository card.",
  catalog: githubRepoJsonRenderCatalog,
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
    sm: { w: 4, h: 4, defaultSpec },
    md: { w: 4, h: 2 },
    lg: { w: 2, h: 2 },
  },
});
