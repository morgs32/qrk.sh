import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/SwatchAndIconJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { SwatchAndIconBrick } from "./SwatchAndIconBrick";
import { swatchAndIconV1 } from "./swatchAndIconV1";

export const swatchAndIconFrontend = makeFrontend(swatchAndIconV1, {
  registry,
  component: SwatchAndIconBrick,
  defaultSpec,
});
