import { makeCollection } from "../../makeCollection";
import { makeTile } from "../../makeTile";
import { GitHubAchievements4x2 } from "./GitHubAchievements4x2";
import { GitHubLanguages2x2 } from "./GitHubLanguages2x2";
import { GitHubProfile4x4 } from "./GitHubProfile4x4";
import { GitHubRepo4x2 } from "./GitHubRepo4x2";

export const githubCardsCollection = makeCollection({
  collectionName: "github-cards",
  collectionLabel: "GitHub",
  tiles: {
    "4x4": makeTile({
      name: "4x4",
      w: 4,
      h: 4,
      label: "4×4",
      order: 0,
      component: GitHubProfile4x4,
    }),
    "achievements-4x2": makeTile({
      name: "achievements-4x2",
      w: 4,
      h: 2,
      label: "4×2",
      order: 1,
      component: GitHubAchievements4x2,
    }),
    "repo-4x2": makeTile({
      name: "repo-4x2",
      w: 4,
      h: 2,
      label: "4×2",
      order: 2,
      component: GitHubRepo4x2,
    }),
    "2x2": makeTile({
      name: "2x2",
      w: 2,
      h: 2,
      label: "2×2",
      order: 3,
      component: GitHubLanguages2x2,
    }),
  },
});
