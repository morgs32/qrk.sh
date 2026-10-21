import { makeModuleVersion } from "../make/makeModuleVersion";
import { instagram } from "./instagram";
import { instagramV1 } from "./instagramV1";

export const instagramV2 = makeModuleVersion(instagram, {
  ...instagramV1,
  version: "2.0.0",
  stateShape: {
    payload: instagramV1.stateShape.payload,
    data: instagramV1.stateShape.data,
  },
  defaultState: {
    payload: instagramV1.defaultState.payload,
    data: instagramV1.defaultState.data,
  },
});
