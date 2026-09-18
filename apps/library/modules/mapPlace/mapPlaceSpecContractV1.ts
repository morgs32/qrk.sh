import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { mapPlaceModelV1 } from "./mapPlaceModelV1";
import { mapPlaceV1 } from "./mapPlaceV1";

export const mapPlaceSpecContractV1 = makeModuleSpecContractVersion({
  models: { mapPlace: mapPlaceModelV1 },
  moduleId: "map-place",
  components: mapPlaceV1.components,
});
