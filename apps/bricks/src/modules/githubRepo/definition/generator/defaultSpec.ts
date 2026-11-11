import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "card-1",
  elements: {
    "card-1": {
      type: "BrickShell",
      props: {},
      children: ["body-1", "footer-1"],
    },
    "body-1": {
      type: "BrickBody",
      props: {},
      children: ["name-1", "description-1"],
    },
    "name-1": {
      type: "RepoName",
      props: {
        name: { $state: "/data/name" },
      },
    },
    "description-1": {
      type: "RepoDescription",
      props: {
        description: { $state: "/data/description" },
      },
    },
    "footer-1": {
      type: "BrickFooter",
      props: {},
      children: ["footer-row-1"],
    },
    "footer-row-1": {
      type: "Row",
      props: {
        gap: 4,
        className: "w-full",
      },
      children: ["stars-1", "forks-1", "language-1"],
    },
    "stars-1": {
      type: "RepoStars",
      props: {
        stargazers_count: { $state: "/data/stargazers_count" },
      },
    },
    "forks-1": {
      type: "RepoForks",
      props: {
        forks_count: { $state: "/data/forks_count" },
      },
    },
    "language-1": {
      type: "RepoLanguage",
      props: {
        language: { $state: "/data/language" },
      },
    },
  },
};
