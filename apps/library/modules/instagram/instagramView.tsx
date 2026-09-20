import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/InstagramJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { InstagramBrick } from "./InstagramBrick";
import { instagramV1 } from "./instagramV1";

export const instagramView = makeModuleView(instagramV1, {
  default: {
    component: InstagramBrick,
    generator: { registry, defaultSpec },
  },
});
