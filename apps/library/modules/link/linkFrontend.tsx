import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generative/LinkJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { LinkBrick } from "./LinkBrick";
import { linkV1 } from "./linkV1";

export const linkFrontend = makeModuleView(linkV1, {
  default: {
    component: LinkBrick,
    generator: { registry, defaultSpec },
  },
  sm: { w: 8, h: 4 },
  md: { w: 8, h: 4 },
});
