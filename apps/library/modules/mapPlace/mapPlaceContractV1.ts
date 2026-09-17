import { makeModuleContractVersion } from "../../make/makeModuleContractVersion";
import { mapPlaceModelV1 } from "./mapPlaceModelV1";

export const mapPlaceContractV1 = makeModuleContractVersion({
  mapPlace: mapPlaceModelV1,
});
