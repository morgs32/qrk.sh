import { makeModuleModelVersion } from "../../make/makeModuleModelVersion";
import { githubProfileModel } from "./githubProfileModel";
import { githubProfileV1 } from "./githubProfileV1";

export const githubProfileModelV1 = makeModuleModelVersion(githubProfileModel, githubProfileV1);
