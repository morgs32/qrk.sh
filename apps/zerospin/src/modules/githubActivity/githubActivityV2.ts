import { makeModuleVersion } from "../make/makeModuleVersion";
import { githubActivity } from "./githubActivity";
import { githubActivityV1 } from "./githubActivityV1";

export const githubActivityV2 = makeModuleVersion(githubActivity, {
  ...githubActivityV1,
  version: "2.0.0",
  stateShape: {
    payload: githubActivityV1.stateShape.payload,
    data: githubActivityV1.stateShape.data,
  },
  defaultState: {
    payload: githubActivityV1.defaultState.payload,
    data: githubActivityV1.defaultState.data,
  },
});
