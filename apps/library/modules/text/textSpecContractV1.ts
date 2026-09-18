import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { textModelV1 } from "./textModelV1";
import { textV1 } from "./textV1";

export const textSpecContractV1 = makeModuleSpecContractVersion({
  models: { text: textModelV1 },
  moduleId: "text",
  components: textV1.components,
});
