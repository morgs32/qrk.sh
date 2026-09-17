import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { BrickShell } from "../../../components/brick/BrickShell";
import {
  RepoDescription as RepoDescriptionLeaf,
  RepoForks as RepoForksLeaf,
  RepoLanguage as RepoLanguageLeaf,
  RepoName as RepoNameLeaf,
  RepoStars as RepoStarsLeaf,
} from "../GitHubRepo/GitHubRepo";
import { githubRepoJsonRenderCatalog } from "./GitHubRepoJsonRenderCatalog";

export const { registry } = defineRegistry(githubRepoJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    BrickShell: ({ children }) => <BrickShell className="min-w-0">{children}</BrickShell>,
    RepoName: ({ props }) => (
      <RepoNameLeaf name={typeof props.name === "string" ? props.name : ""} />
    ),
    RepoDescription: ({ props }) => (
      <RepoDescriptionLeaf
        description={
          typeof props.description === "string" || props.description === null
            ? props.description
            : null
        }
      />
    ),
    RepoStars: ({ props }) => (
      <RepoStarsLeaf
        stargazers_count={typeof props.stargazers_count === "number" ? props.stargazers_count : 0}
      />
    ),
    RepoForks: ({ props }) => (
      <RepoForksLeaf forks_count={typeof props.forks_count === "number" ? props.forks_count : 0} />
    ),
    RepoLanguage: ({ props }) => (
      <RepoLanguageLeaf
        language={
          typeof props.language === "string" || props.language === null ? props.language : null
        }
      />
    ),
  },
});
