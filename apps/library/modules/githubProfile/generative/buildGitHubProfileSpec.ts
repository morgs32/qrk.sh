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
        children: ["avatar-1", "identity-1", "bio-1", "meta-1", "stats-1"],
      },
      "avatar-1": {
        type: "Avatar",
        props: {
          avatar_url: data.avatar_url,
          login: data.login,
        },
      },
      "identity-1": {
        type: "Identity",
        props: {
          name: data.name,
          login: data.login,
        },
      },
      "bio-1": {
        type: "Bio",
        props: {
          bio: data.bio,
        },
      },
      "meta-1": {
        type: "MetaRow",
        props: {
          location: data.location,
          blog: data.blog,
        },
      },
      "stats-1": {
        type: "StatsRow",
        props: {
          public_repos: data.public_repos,
          followers: data.followers,
          following: data.following,
        },
      },
    },
  };
}
