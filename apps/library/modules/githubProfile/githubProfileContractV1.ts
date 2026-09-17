import { makeModuleContractVersion } from "../../make/makeModuleContractVersion";
import { githubProfileModelV1 } from "./githubProfileModelV1";

export const githubProfileContractV1 = makeModuleContractVersion({
  githubProfile: githubProfileModelV1,
});
