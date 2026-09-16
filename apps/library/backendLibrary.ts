import { makeBackendLibrary } from "./make/makeBackendLibrary";
import { githubProfileJsonRenderCatalog } from "./modules/githubProfile/generative/GitHubProfileJsonRenderCatalog";

export const backendLibrary = makeBackendLibrary({
  "github-profile": {
    catalog: githubProfileJsonRenderCatalog,
  },
});

export type IBackendLibrary = typeof backendLibrary;
