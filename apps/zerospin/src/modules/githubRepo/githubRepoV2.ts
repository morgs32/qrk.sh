import { makeModuleVersion } from "../make/makeModuleVersion";
import { githubRepo } from "./githubRepo";
import { githubRepoV1 } from "./githubRepoV1";

export const githubRepoV2 = makeModuleVersion(githubRepo, {
  ...githubRepoV1,
  version: "2.0.0",
  stateShape: {
    payload: githubRepoV1.stateShape.payload,
    data: githubRepoV1.stateShape.data,
  },
  defaultState: {
    payload: githubRepoV1.defaultState.payload,
    data: githubRepoV1.defaultState.data,
  },
});
