import { makeModuleVersion } from "../make/makeModuleVersion";
import { mapPlace } from "./mapPlace";
import { mapPlaceV1 } from "./mapPlaceV1";

export const mapPlaceV2 = makeModuleVersion(mapPlace, {
  ...mapPlaceV1,
  version: "2.0.0",
  stateShape: {
    payload: mapPlaceV1.stateShape.payload,
    data: mapPlaceV1.stateShape.data,
  },
  defaultState: {
    payload: mapPlaceV1.defaultState.payload,
    data: mapPlaceV1.defaultState.data,
  },
});
