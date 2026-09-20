import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/LinkJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { LinkBrick } from "./LinkBrick";
import { linkV1 } from "./linkV1";

export const linkView = makeModuleView(linkV1, {
  default: {
    component: LinkBrick,
    generator: { registry, defaultSpec },
  },
  sm: { w: 8, h: 4 },
  md: { w: 8, h: 4 },
});
