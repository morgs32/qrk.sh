import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { avatarAndUsernameView } from "../GitHubProfile/components/AvatarAndUsername";
import { bioView } from "../GitHubProfile/components/Bio";
import { blogView } from "../GitHubProfile/components/Blog";
import { followersView } from "../GitHubProfile/components/Followers";
import { followingView } from "../GitHubProfile/components/Following";
import { locationView } from "../GitHubProfile/components/Location";
import { publicReposView } from "../GitHubProfile/components/PublicRepos";
import { githubProfileV1 } from "../githubProfileV1";

export const { registry } = defineRegistry(githubProfileV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    AvatarAndUsername: avatarAndUsernameView.RegistryComponent,
    Bio: bioView.RegistryComponent,
    Blog: blogView.RegistryComponent,
    Followers: followersView.RegistryComponent,
    Following: followingView.RegistryComponent,
    Location: locationView.RegistryComponent,
    PublicRepos: publicReposView.RegistryComponent,
  },
});
