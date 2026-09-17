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
  data: {
    avatar_url: string;
    login: string;
    bio: string | null;
    location: string | null;
    blog: string;
    followers: number;
    following: number;
    public_repos: number;
  };
  breakpointOptions: unknown;
}) {
  return (
    <BrickShell>
      <BrickBody>
        <Column gap={2}>
          <AvatarAndUsername avatar_url={props.data.avatar_url} login={props.data.login} />
          <Bio bio={props.data.bio} />
          <Location location={props.data.location} />
          <Blog blog={props.data.blog} />
        </Column>
      </BrickBody>
      <BrickFooter>
        <Row className="w-full" gap={2} justifyContent="flex-end">
          <Followers followers={props.data.followers} />
          <Following following={props.data.following} />
          <PublicRepos public_repos={props.data.public_repos} />
        </Row>
      </BrickFooter>
    </BrickShell>
  );
}
