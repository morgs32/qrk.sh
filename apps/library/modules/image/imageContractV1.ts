import { makeModuleContractVersion } from "../../make/makeModuleContractVersion";
import { imageModelV1 } from "./imageModelV1";

export const imageContractV1 = makeModuleContractVersion({
  image: imageModelV1,
});
