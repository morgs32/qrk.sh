import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { AvatarAndUsername } from "../GitHubProfile/components/AvatarAndUsername";
import { Bio } from "../GitHubProfile/components/Bio";
import { Blog } from "../GitHubProfile/components/Blog";
import { Followers } from "../GitHubProfile/components/Followers";
import { Following } from "../GitHubProfile/components/Following";
import { Location } from "../GitHubProfile/components/Location";
import { PublicRepos } from "../GitHubProfile/components/PublicRepos";
import { githubProfileJsonRenderCatalog } from "./GitHubProfileJsonRenderCatalog";

export const { registry } = defineRegistry(githubProfileJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    AvatarAndUsername: ({ props }) => (
      <AvatarAndUsername
        avatar_url={typeof props.avatar_url === "string" ? props.avatar_url : ""}
        login={typeof props.login === "string" ? props.login : ""}
      />
    ),
    Bio: ({ props }) => (
      <Bio bio={typeof props.bio === "string" || props.bio === null ? props.bio : null} />
    ),
    Location: ({ props }) => (
      <Location
        location={
          typeof props.location === "string" || props.location === null ? props.location : null
        }
      />
    ),
    Blog: ({ props }) => <Blog blog={typeof props.blog === "string" ? props.blog : ""} />,
    Followers: ({ props }) => (
      <Followers followers={typeof props.followers === "number" ? props.followers : 0} />
    ),
    Following: ({ props }) => (
      <Following following={typeof props.following === "number" ? props.following : 0} />
    ),
    PublicRepos: ({ props }) => (
      <PublicRepos
        public_repos={typeof props.public_repos === "number" ? props.public_repos : 0}
      />
    ),
  },
});
