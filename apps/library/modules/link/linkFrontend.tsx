import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/LinkJsonRenderRegistry";
import { LinkBrick } from "./LinkBrick";
import { link } from "./link";

export const linkFrontend = makeFrontend(link, {
  registry,
  component: LinkBrick,
});
