import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { instagramModelV1 } from "./instagramModelV1";
import { instagramV1 } from "./instagramV1";

export const instagramSpecContractV1 = makeModuleSpecContractVersion({
  models: { instagram: instagramModelV1 },
  moduleId: "instagram",
  components: instagramV1.components,
});
