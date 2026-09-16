import { defineRegistry } from "@json-render/react";

import { BrickBody } from "../../../components/brick/BrickBody";
import { BrickFooter } from "../../../components/brick/BrickFooter";
import { BrickShell } from "../../../components/brick/BrickShell";
import { Avatar } from "../GitHubProfile/components/Avatar";
import { Bio } from "../GitHubProfile/components/Bio";
import { Blog } from "../GitHubProfile/components/Blog";
import { Followers } from "../GitHubProfile/components/Followers";
import { Following } from "../GitHubProfile/components/Following";
import { Location } from "../GitHubProfile/components/Location";
import { Login } from "../GitHubProfile/components/Login";
import { ProfileHeader } from "../GitHubProfile/components/ProfileHeader";
import { PublicRepos } from "../GitHubProfile/components/PublicRepos";
import { githubProfileJsonRenderCatalog } from "./GitHubProfileJsonRenderCatalog";

export const { registry } = defineRegistry(githubProfileJsonRenderCatalog, {
  components: {
    BrickShell: ({ children }) => <BrickShell>{children}</BrickShell>,
    ProfileHeader: ({ children }) => <ProfileHeader>{children}</ProfileHeader>,
    BrickBody: ({ children }) => <BrickBody>{children}</BrickBody>,
    BrickFooter: ({ children }) => (
      <BrickFooter className="justify-end gap-4">{children}</BrickFooter>
    ),
    Avatar: ({ props }) => <Avatar avatar_url={props.avatar_url} login={props.login} />,
    Login: ({ props }) => <Login login={props.login} />,
    Bio: ({ props }) => <Bio bio={props.bio} />,
    Location: ({ props }) => <Location location={props.location} />,
    Blog: ({ props }) => <Blog blog={props.blog} />,
    Followers: ({ props }) => <Followers followers={props.followers} />,
    Following: ({ props }) => <Following following={props.following} />,
    PublicRepos: ({ props }) => <PublicRepos public_repos={props.public_repos} />,
  },
});
