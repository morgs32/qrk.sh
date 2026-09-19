import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generative/InstagramJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { InstagramBrick } from "./InstagramBrick";
import { instagramV1 } from "./instagramV1";

export const instagramView = makeModuleView(instagramV1, {
  default: {
    component: InstagramBrick,
    generator: { registry, defaultSpec },
  },
});
