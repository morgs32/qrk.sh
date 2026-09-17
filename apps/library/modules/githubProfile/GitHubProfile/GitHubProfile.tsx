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
  state: {
    payload: { url: string };
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
  };
}) {
  return (
    <BrickShell>
      <BrickBody>
        <Column gap={2}>
          <AvatarAndUsername
            avatar_url={props.state.data.avatar_url}
            login={props.state.data.login}
          />
          <Bio bio={props.state.data.bio} />
          <Location location={props.state.data.location} />
          <Blog blog={props.state.data.blog} />
        </Column>
      </BrickBody>
      <BrickFooter>
        <Row className="w-full" gap={2} justifyContent="flex-end">
          <Followers followers={props.state.data.followers} />
          <Following following={props.state.data.following} />
          <PublicRepos public_repos={props.state.data.public_repos} />
        </Row>
      </BrickFooter>
    </BrickShell>
  );
}
