import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { imageModelV1 } from "./imageModelV1";
import { imageV1 } from "./imageV1";

export const imageSpecContractV1 = makeModuleSpecContractVersion({
  models: { image: imageModelV1 },
  moduleId: "image",
  components: imageV1.components,
});
