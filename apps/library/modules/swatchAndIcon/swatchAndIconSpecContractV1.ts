import { makeModuleSpecContractVersion } from "../../make/makeModuleSpecContractVersion";
import { swatchAndIconModelV1 } from "./swatchAndIconModelV1";
import { swatchAndIconV1 } from "./swatchAndIconV1";

export const swatchAndIconSpecContractV1 = makeModuleSpecContractVersion({
  models: { swatchAndIcon: swatchAndIconModelV1 },
  moduleId: "swatch-and-icon",
  components: swatchAndIconV1.components,
});
