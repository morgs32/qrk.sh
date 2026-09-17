import { makeFrontend } from "../../make/makeFrontend";
import { ImageBrick } from "./ImageBrick";
import { registry } from "./generative/ImageJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { imageV1 } from "./imageV1";

export const imageFrontend = makeFrontend(imageV1, {
  registry,
  component: ImageBrick,
  defaultSpec,
});
