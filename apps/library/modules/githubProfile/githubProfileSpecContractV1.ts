import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { githubProfileModelV1 } from "./githubProfileModelV1";
import { githubProfileV1 } from "./githubProfileV1";

export const githubProfileSpecContractV1 = makeModuleSpecContractVersion({
  models: { githubProfile: githubProfileModelV1 },
  moduleId: "github-profile",
  components: githubProfileV1.components,
});
