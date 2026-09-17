import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/InstagramJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { InstagramBrick } from "./InstagramBrick";
import { instagramV1 } from "./instagramV1";

export const instagramFrontend = makeFrontend(instagramV1, {
  registry,
  component: InstagramBrick,
  defaultSpec,
});
