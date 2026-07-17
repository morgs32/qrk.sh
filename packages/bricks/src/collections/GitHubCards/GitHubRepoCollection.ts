import { makeCollection } from "../../makeCollection";
import { makeBrick } from "../../makeBrick";
import { GitHubLanguages2x2 } from "./GitHubLanguages2x2";
import { GitHubRepo4x2 } from "./GitHubRepo4x2";

export const githubRepoCollection = makeCollection({
  collectionName: "github-repo",
  collectionLabel: "GitHub Repo",
  bricks: {
    "repo-4x2": makeBrick({
      name: "repo-4x2",
      w: 4,
      h: 2,
      label: "4×2",
      order: 0,
      component: GitHubRepo4x2,
    }),
    "2x2": makeBrick({
      name: "2x2",
      w: 2,
      h: 2,
      label: "2×2",
      order: 1,
      component: GitHubLanguages2x2,
    }),
  },
});
