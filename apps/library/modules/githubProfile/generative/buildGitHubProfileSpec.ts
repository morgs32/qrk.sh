import type { Spec } from "@json-render/core";

export function buildGitHubProfileSpec(data: {
  login: string;
  avatar_url: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  blog: string;
  public_repos: number;
  followers: number;
  following: number;
}): Spec {
  return {
    root: "card-1",
    elements: {
      "card-1": {
        type: "ProfileCard",
        props: {},
        children: ["body-1", "footer-1"],
      },
      "header-1": {
        type: "ProfileHeader",
        props: {},
        children: ["avatar-1", "login-1"],
      },
      "avatar-1": {
        type: "Avatar",
        props: {
          avatar_url: data.avatar_url,
          login: data.login,
        },
      },
      "login-1": {
        type: "Login",
        props: {
          login: data.login,
        },
      },
      "body-1": {
        type: "ProfileBody",
        props: {},
        children: ["header-1", "bio-1", "location-1", "blog-1"],
      },
      "bio-1": {
        type: "Bio",
        props: {
          bio: data.bio,
        },
      },
      "location-1": {
        type: "Location",
        props: {
          location: data.location,
        },
      },
      "blog-1": {
        type: "Blog",
        props: {
          blog: data.blog,
        },
      },
      "footer-1": {
        type: "ProfileFooter",
        props: {},
        children: ["followers-1", "following-1", "public-repos-1"],
      },
      "followers-1": {
        type: "Followers",
        props: {
          followers: data.followers,
        },
      },
      "following-1": {
        type: "Following",
        props: {
          following: data.following,
        },
      },
      "public-repos-1": {
        type: "PublicRepos",
        props: {
          public_repos: data.public_repos,
        },
      },
    },
  };
}
