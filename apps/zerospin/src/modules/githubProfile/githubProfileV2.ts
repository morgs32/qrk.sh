import { makeModuleVersion } from "../make/makeModuleVersion";
import { githubProfile } from "./githubProfile";
import { githubProfileV1 } from "./githubProfileV1";

export const githubProfileV2 = makeModuleVersion(githubProfile, {
  ...githubProfileV1,
  version: "2.0.0",
  stateShape: {
    payload: githubProfileV1.stateShape.payload,
    data: githubProfileV1.stateShape.data,
  },
  defaultState: {
    payload: githubProfileV1.defaultState.payload,
    data: githubProfileV1.defaultState.data,
  },
});
