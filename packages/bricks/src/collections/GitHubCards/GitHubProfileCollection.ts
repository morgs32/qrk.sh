import { primitives } from "@zerospin/core/models/primitives";

import { makeCollection } from "../../makeCollection";
import { makeBrick } from "../../makeBrick";
import { makeVariant } from "../../makeVariant";
import { GitHubProfile4x2 } from "./GitHubProfile4x2";
import { GitHubProfile4x4 } from "./GitHubProfile4x4";
import { GitHubRepo4x2 } from "./GitHubRepo4x2";

export const githubCollection = makeCollection({
  collectionName: "github",
  collectionLabel: "GitHub",
  collectionDescription: "Profile and repository cards from GitHub.",
  variants: {
    profile: makeVariant({
      variant: "profile",
      variantDescription: "A GitHub profile card.",
      payload: {
        url: primitives.text({ defaultValue: "https://github.com/morgs32" }),
      },
      getData: ({ api, payload }) => api.githubRepo().getProfile(payload.url),
      sizes: {
        "4x4": makeBrick({
          variant: "profile",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: GitHubProfile4x4,
        }),
        "4x2": makeBrick({
          variant: "profile",
          size: "4x2",
          w: 4,
          h: 2,
          label: "4×2",
          order: 1,
          component: GitHubProfile4x2,
        }),
      },
    }),
    repo: makeVariant({
      variant: "repo",
      variantDescription: "A GitHub repository card.",
      sizes: {
        "4x2": makeBrick({
          variant: "repo",
          size: "4x2",
          w: 4,
          h: 2,
          label: "4×2",
          order: 1,
          component: GitHubRepo4x2,
        }),
      },
    }),
  },
});
