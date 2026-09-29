import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/GitHubProfileJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { githubProfileV1 } from "./githubProfileV1";
import { BrickBody } from "../../components/brick/BrickBody";
import { BrickFooter } from "../../components/brick/BrickFooter";
import { BrickShell } from "../../components/brick/BrickShell";
import { Column } from "../../components/Column";
import { Row } from "../../components/Row";
import { avatarAndUsernameView } from "./GitHubProfile/components/AvatarAndUsername";
import { bioView } from "./GitHubProfile/components/Bio";
import { blogView } from "./GitHubProfile/components/Blog";
import { followersView } from "./GitHubProfile/components/Followers";
import { followingView } from "./GitHubProfile/components/Following";
import { locationView } from "./GitHubProfile/components/Location";
import { publicReposView } from "./GitHubProfile/components/PublicRepos";

export const githubProfileView = makeModuleView(githubProfileV1, {
  default: {
    component(props) {
      const { state } = props;
      return (
        <BrickShell className="bg-white">
          <BrickBody>
            <Column gap={2}>
              <avatarAndUsernameView.Component
                avatar_url={state.data.avatar_url}
                login={state.data.login}
              />
              <bioView.Component bio={state.data.bio} />
              <locationView.Component location={state.data.location} />
              <blogView.Component blog={state.data.blog} />
            </Column>
          </BrickBody>
          <BrickFooter>
            <Row className="w-full" gap={2} justifyContent="flex-end">
              <followersView.Component followers={state.data.followers} />
              <followingView.Component following={state.data.following} />
              <publicReposView.Component public_repos={state.data.public_repos} />
            </Row>
          </BrickFooter>
        </BrickShell>
      );
    },
    generator: { registry, defaultSpec },
  },
});
