import { makeModuleContractVersion } from "../../make/makeModuleContractVersion";
import { linkModelV1 } from "./linkModelV1";

export const linkContractV1 = makeModuleContractVersion({
  link: linkModelV1,
});
