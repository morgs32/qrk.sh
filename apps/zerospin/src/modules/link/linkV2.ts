import { makeModuleVersion } from "../make/makeModuleVersion";
import { link } from "./link";
import { linkV1 } from "./linkV1";

export const linkV2 = makeModuleVersion(link, {
  ...linkV1,
  version: "2.0.0",
  stateShape: {
    payload: linkV1.stateShape.payload,
    data: linkV1.stateShape.data,
  },
  defaultState: {
    payload: linkV1.defaultState.payload,
    data: linkV1.defaultState.data,
  },
});
