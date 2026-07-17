import { makeCollection } from "../../makeCollection";
import { makeBrick } from "../../makeBrick";
import { GitHubAchievements4x2 } from "./GitHubAchievements4x2";
import { GitHubProfile4x4 } from "./GitHubProfile4x4";

export const githubProfileCollection = makeCollection({
  collectionName: "github-profile",
  collectionLabel: "GitHub Profile",
  bricks: {
    "4x4": makeBrick({
      name: "4x4",
      w: 4,
      h: 4,
      label: "4×4",
      order: 0,
      component: GitHubProfile4x4,
    }),
    "achievements-4x2": makeBrick({
      name: "achievements-4x2",
      w: 4,
      h: 2,
      label: "4×2",
      order: 1,
      component: GitHubAchievements4x2,
    }),
  },
});
