import { makeModuleContractVersion } from "../../make/makeModuleContractVersion";
import { instagramModelV1 } from "./instagramModelV1";

export const instagramContractV1 = makeModuleContractVersion({
  instagram: instagramModelV1,
});
