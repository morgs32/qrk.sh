import { makeModuleContractVersion } from "../../make/makeModuleContractVersion";
import { githubRepoModelV1 } from "./githubRepoModelV1";

export const githubRepoContractV1 = makeModuleContractVersion({
  githubRepo: githubRepoModelV1,
});
