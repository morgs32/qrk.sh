import { makeModuleContractVersion } from "../../make/makeModuleContractVersion";
import { textModelV1 } from "./textModelV1";

export const textContractV1 = makeModuleContractVersion({
  text: textModelV1,
});
