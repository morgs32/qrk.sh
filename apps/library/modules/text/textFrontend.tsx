import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generative/TextJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { TextBrick } from "./TextBrick";
import { textV1 } from "./textV1";

export const textFrontend = makeModuleView(textV1, {
  default: {
    component: TextBrick,
    generator: { registry, defaultSpec },
  },
});
