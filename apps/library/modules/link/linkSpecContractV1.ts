import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { linkModelV1 } from "./linkModelV1";
import { linkV1 } from "./linkV1";

export const linkSpecContractV1 = makeModuleSpecContractVersion({
  models: { link: linkModelV1 },
  moduleId: "link",
  components: linkV1.components,
});
