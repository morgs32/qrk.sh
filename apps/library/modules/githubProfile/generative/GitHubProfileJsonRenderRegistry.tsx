import { defineRegistry } from "@json-render/react";

import { Avatar } from "../components/Avatar";
import { Bio } from "../components/Bio";
import { Blog } from "../components/Blog";
import { Followers } from "../components/Followers";
import { Following } from "../components/Following";
import { Location } from "../components/Location";
import { Login } from "../components/Login";
import { ProfileBody } from "../components/ProfileBody";
import { ProfileCard } from "../components/ProfileCard";
import { ProfileFooter } from "../components/ProfileFooter";
import { ProfileHeader } from "../components/ProfileHeader";
import { PublicRepos } from "../components/PublicRepos";
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
