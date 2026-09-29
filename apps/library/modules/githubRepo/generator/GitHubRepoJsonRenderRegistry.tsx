import { defineRegistry } from "@json-render/react";
import type { ReactNode } from "react";

import { BrickShell } from "../../../components/brick/BrickShell";
import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { repoNameView } from "../GitHubRepo/components/RepoName";
import { repoDescriptionView } from "../GitHubRepo/components/RepoDescription";
import { repoStarsView } from "../GitHubRepo/components/RepoStars";
import { repoForksView } from "../GitHubRepo/components/RepoForks";
import { repoLanguageView } from "../GitHubRepo/components/RepoLanguage";
import { githubRepoV1 } from "../githubRepoV1";

export const { registry } = defineRegistry(githubRepoV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    BrickShell: (props: { children?: ReactNode }) => {
      const { children } = props;
      return <BrickShell className="bg-white">{children}</BrickShell>;
    },
    RepoName: repoNameView.RegistryComponent,
    RepoDescription: repoDescriptionView.RegistryComponent,
    RepoStars: repoStarsView.RegistryComponent,
    RepoForks: repoForksView.RegistryComponent,
    RepoLanguage: repoLanguageView.RegistryComponent,
  },
});
