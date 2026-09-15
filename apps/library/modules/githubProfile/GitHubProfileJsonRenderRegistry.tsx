import { defineRegistry } from "@json-render/react";

import { Avatar } from "./Avatar";
import { Bio } from "./Bio";
import { githubProfileJsonRenderCatalog } from "./GitHubProfileJsonRenderCatalog";
import { Identity } from "./Identity";
import { MetaRow } from "./MetaRow";
import { ProfileCard } from "./ProfileCard";
import { StatsRow } from "./StatsRow";

export const { registry } = defineRegistry(githubProfileJsonRenderCatalog, {
  components: {
    ProfileCard: ({ children }) => <ProfileCard>{children}</ProfileCard>,
    Avatar: ({ props }) => <Avatar avatar_url={props.avatar_url} login={props.login} />,
    Identity: ({ props }) => <Identity name={props.name} login={props.login} />,
    Bio: ({ props }) => <Bio bio={props.bio} />,
    MetaRow: ({ props }) => <MetaRow location={props.location} blog={props.blog} />,
    StatsRow: ({ props }) => (
      <StatsRow
        public_repos={props.public_repos}
        followers={props.followers}
        following={props.following}
      />
    ),
  },
});
