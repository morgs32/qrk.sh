import { defineRegistry } from "@json-render/react";

import { BrickBody } from "../../../components/brick/BrickBody";
import { BrickFooter } from "../../../components/brick/BrickFooter";
import { BrickShell } from "../../../components/brick/BrickShell";
import { Column } from "../../../components/Column";
import { Row } from "../../../components/Row";
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
    BrickShell: ({ children }) => <BrickShell>{children}</BrickShell>,
    AvatarAndUsername: ({ props }) => (
      <AvatarAndUsername
        avatar_url={typeof props.avatar_url === "string" ? props.avatar_url : ""}
        login={typeof props.login === "string" ? props.login : ""}
      />
    ),
    BrickBody: ({ children }) => <BrickBody>{children}</BrickBody>,
    BrickFooter: ({ children }) => <BrickFooter>{children}</BrickFooter>,
    Column: ({ children, props }) => (
      <Column
        gap={props.gap}
        justifyContent={props.justifyContent}
        alignItems={props.alignItems}
        flexWrap={props.flexWrap}
      >
        {children}
      </Column>
    ),
    Row: ({ children, props }) => (
      <Row
        className={props.className}
        gap={props.gap}
        justifyContent={props.justifyContent}
        alignItems={props.alignItems}
        flexWrap={props.flexWrap}
      >
        {children}
      </Row>
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
