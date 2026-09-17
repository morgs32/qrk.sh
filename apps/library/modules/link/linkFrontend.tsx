import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/LinkJsonRenderRegistry";
import { link } from "./link";

export const linkFrontend = makeFrontend(link, {
  registry,
});
