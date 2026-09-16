"use client";

import { BrickBody } from "../../../components/brick/BrickBody";
import { BrickFooter } from "../../../components/brick/BrickFooter";
import { BrickShell } from "../../../components/brick/BrickShell";
import { Column } from "../../../components/Column";
import { Row } from "../../../components/Row";
import { AvatarAndUsername } from "./components/AvatarAndUsername";
import { Bio } from "./components/Bio";
import { Blog } from "./components/Blog";
import { Followers } from "./components/Followers";
import { Following } from "./components/Following";
import { Location } from "./components/Location";
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
    <BrickShell>
      <BrickBody>
        <Column gap={2}>
          <AvatarAndUsername avatar_url={user.avatar_url} login={user.login} />
          <Bio bio={user.bio} />
          <Location location={user.location} />
          <Blog blog={user.blog} />
        </Column>
      </BrickBody>

      <BrickFooter>
        <Row className="w-full" gap={2} justifyContent="flex-end">
          <Followers followers={user.followers} />
          <Following following={user.following} />
          <PublicRepos public_repos={user.public_repos} />
        </Row>
      </BrickFooter>
    </BrickShell>
  );
}
