import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/InstagramJsonRenderRegistry";
import { InstagramBrick } from "./InstagramBrick";
import { instagram } from "./instagram";

export const instagramFrontend = makeFrontend(instagram, {
  registry,
  component: InstagramBrick,
});
