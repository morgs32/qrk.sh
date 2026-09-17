import { makeFrontend } from "../../make/makeFrontend";
import { registry } from "./generative/TextJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { TextBrick } from "./TextBrick";
import { textV1 } from "./textV1";

export const textFrontend = makeFrontend(textV1, {
  registry,
  component: TextBrick,
  defaultSpec,
});
