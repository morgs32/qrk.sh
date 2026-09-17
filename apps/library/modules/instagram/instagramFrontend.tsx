import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/InstagramJsonRenderRegistry";
import { instagram } from "./instagram";

export const instagramFrontend = makeFrontend(instagram, {
  registry,
});
