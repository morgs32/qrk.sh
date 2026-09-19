import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import {
  RepoDescription as RepoDescriptionLeaf,
  RepoForks as RepoForksLeaf,
  RepoLanguage as RepoLanguageLeaf,
  RepoName as RepoNameLeaf,
  RepoStars as RepoStarsLeaf,
} from "../GitHubRepo/GitHubRepo";
import { githubRepoV1 } from "../githubRepoV1";

export const { registry } = defineRegistry(githubRepoV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    RepoName: ({ props }: { props: Record<string, unknown> }) => (
      <RepoNameLeaf name={typeof props.name === "string" ? props.name : ""} />
    ),
    RepoDescription: ({ props }: { props: Record<string, unknown> }) => (
      <RepoDescriptionLeaf
        description={
          typeof props.description === "string" || props.description === null
            ? props.description
            : null
        }
      />
    ),
    RepoStars: ({ props }: { props: Record<string, unknown> }) => (
      <RepoStarsLeaf
        stargazers_count={typeof props.stargazers_count === "number" ? props.stargazers_count : 0}
      />
    ),
    RepoForks: ({ props }: { props: Record<string, unknown> }) => (
      <RepoForksLeaf forks_count={typeof props.forks_count === "number" ? props.forks_count : 0} />
    ),
    RepoLanguage: ({ props }: { props: Record<string, unknown> }) => (
      <RepoLanguageLeaf
        language={
          typeof props.language === "string" || props.language === null ? props.language : null
        }
      />
    ),
  },
});
