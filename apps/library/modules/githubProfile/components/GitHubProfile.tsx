"use client";

import { Avatar } from "./Avatar";
import { Bio } from "./Bio";
import { Blog } from "./Blog";
import { Followers } from "./Followers";
import { Following } from "./Following";
import { Location } from "./Location";
import { Login } from "./Login";
import { ProfileBody } from "./ProfileBody";
import { ProfileCard } from "./ProfileCard";
import { ProfileFooter } from "./ProfileFooter";
import { ProfileHeader } from "./ProfileHeader";
import { PublicRepos } from "./PublicRepos";

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
