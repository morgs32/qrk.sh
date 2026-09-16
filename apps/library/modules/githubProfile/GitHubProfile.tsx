"use client";

import { Avatar } from "./components/Avatar";
import { Bio } from "./components/Bio";
import { Blog } from "./components/Blog";
import { Followers } from "./components/Followers";
import { Following } from "./components/Following";
import { Location } from "./components/Location";
import { Login } from "./components/Login";
import { ProfileBody } from "./components/ProfileBody";
import { ProfileCard } from "./components/ProfileCard";
import { ProfileFooter } from "./components/ProfileFooter";
import { ProfileHeader } from "./components/ProfileHeader";
import { PublicRepos } from "./components/PublicRepos";

export function GitHubProfile(props: {
  breakpoint: "sm" | "md" | "lg" | "xl";
  data: {
    login: string;
    avatar_url: string;
    name: string | null;
    bio: string | null;
    location: string | null;
    blog: string;
    public_repos: number;
    followers: number;
    following: number;
  };
}) {
  const user = props.data;

  return (
    <ProfileCard>
      <ProfileHeader>
        <Avatar avatar_url={user.avatar_url} login={user.login} />
        <Login login={user.login} />
      </ProfileHeader>

      <ProfileBody>
        <Bio bio={user.bio} />
        <Location location={user.location} />
        <Blog blog={user.blog} />
      </ProfileBody>

      <ProfileFooter>
        <Followers followers={user.followers} />
        <Following following={user.following} />
        <PublicRepos public_repos={user.public_repos} />
      </ProfileFooter>
    </ProfileCard>
  );
}
