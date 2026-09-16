import { defineRegistry } from "@json-render/react";

import { Avatar } from "../GitHubProfile/components/Avatar";
import { Bio } from "../GitHubProfile/components/Bio";
import { Blog } from "../GitHubProfile/components/Blog";
import { Followers } from "../GitHubProfile/components/Followers";
import { Following } from "../GitHubProfile/components/Following";
import { Location } from "../GitHubProfile/components/Location";
import { Login } from "../GitHubProfile/components/Login";
import { ProfileBody } from "../GitHubProfile/components/ProfileBody";
import { ProfileCard } from "../GitHubProfile/components/ProfileCard";
import { ProfileFooter } from "../GitHubProfile/components/ProfileFooter";
import { ProfileHeader } from "../GitHubProfile/components/ProfileHeader";
import { PublicRepos } from "../GitHubProfile/components/PublicRepos";
import { githubProfileJsonRenderCatalog } from "./GitHubProfileJsonRenderCatalog";

export const { registry } = defineRegistry(githubProfileJsonRenderCatalog, {
  components: {
    ProfileCard: ({ children }) => <ProfileCard>{children}</ProfileCard>,
    ProfileHeader: ({ children }) => <ProfileHeader>{children}</ProfileHeader>,
    ProfileBody: ({ children }) => <ProfileBody>{children}</ProfileBody>,
    ProfileFooter: ({ children }) => <ProfileFooter>{children}</ProfileFooter>,
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
