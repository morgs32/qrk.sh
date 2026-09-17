import { makeModuleContractVersion } from "../../make/makeModuleContractVersion";
import { githubActivityModelV1 } from "./githubActivityModelV1";

export const githubActivityContractV1 = makeModuleContractVersion({
  githubActivity: githubActivityModelV1,
});
