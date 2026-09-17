import { makeModuleContractVersion } from "../../make/makeModuleContractVersion";
import { figmaThumbnailModelV1 } from "./figmaThumbnailModelV1";

export const figmaThumbnailContractV1 = makeModuleContractVersion({
  figmaThumbnail: figmaThumbnailModelV1,
});
