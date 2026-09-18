import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { figmaThumbnailModelV1 } from "./figmaThumbnailModelV1";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";

export const figmaThumbnailSpecContractV1 = makeModuleSpecContractVersion({
  models: { figmaThumbnail: figmaThumbnailModelV1 },
  moduleId: "figma-thumbnail",
  components: figmaThumbnailV1.components,
});
