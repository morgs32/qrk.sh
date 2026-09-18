import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { githubActivityModelV1 } from "./githubActivityModelV1";
import { githubActivityV1 } from "./githubActivityV1";

export const githubActivitySpecContractV1 = makeModuleSpecContractVersion({
  models: { githubActivity: githubActivityModelV1 },
  moduleId: "github-activity",
  components: githubActivityV1.components,
});
