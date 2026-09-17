import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/LinkJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { LinkBrick } from "./LinkBrick";
import { linkV1 } from "./linkV1";

export const linkFrontend = makeFrontend(linkV1, {
  registry,
  component: LinkBrick,
  defaultSpec,
});
