import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generative/SwatchAndIconJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { SwatchAndIconBrick } from "./SwatchAndIconBrick";
import { swatchAndIconV1 } from "./swatchAndIconV1";

export const swatchAndIconView = makeModuleView(swatchAndIconV1, {
  default: {
    component: SwatchAndIconBrick,
    generator: { registry, defaultSpec },
  },
});
