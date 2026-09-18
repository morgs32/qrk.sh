import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { githubRepoModelV1 } from "./githubRepoModelV1";
import { githubRepoV1 } from "./githubRepoV1";

export const githubRepoSpecContractV1 = makeModuleSpecContractVersion({
  models: { githubRepo: githubRepoModelV1 },
  moduleId: "github-repo",
  components: githubRepoV1.components,
});
