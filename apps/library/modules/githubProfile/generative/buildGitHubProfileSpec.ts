import type { Spec } from "@json-render/core";

export function buildGitHubProfileSpec(): Spec {
  return {
    root: "card-1",
    elements: {
      "card-1": {
        type: "BrickShell",
        props: {},
        children: ["body-1", "footer-1"],
      },
      "header-1": {
        type: "AvatarAndUsername",
        props: {
          avatar_url: { $state: "/avatar_url" },
          login: { $state: "/login" },
        },
      },
      "body-1": {
        type: "BrickBody",
        props: {},
        children: ["body-column-1"],
      },
      "body-column-1": {
        type: "Column",
        props: {
          gap: 2,
        },
        children: ["header-1", "bio-1", "location-1", "blog-1"],
      },
      "bio-1": {
        type: "Bio",
        props: {
          bio: { $state: "/bio" },
        },
      },
      "location-1": {
        type: "Location",
        props: {
          location: { $state: "/location" },
        },
      },
      "blog-1": {
        type: "Blog",
        props: {
          blog: { $state: "/blog" },
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
          gap: 2,
          justifyContent: "flex-end",
          className: "w-full",
        },
        children: ["followers-1", "following-1", "public-repos-1"],
      },
      "followers-1": {
        type: "Followers",
        props: {
          followers: { $state: "/followers" },
        },
      },
      "following-1": {
        type: "Following",
        props: {
          following: { $state: "/following" },
        },
      },
      "public-repos-1": {
        type: "PublicRepos",
        props: {
          public_repos: { $state: "/public_repos" },
        },
      },
    },
  };
}
