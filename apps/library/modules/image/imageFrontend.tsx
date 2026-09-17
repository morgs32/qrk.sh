import { makeFrontend } from "../../make/makeFrontend";
import { ImageBreakpointOptionsForm } from "./ImageBreakpointOptionsForm";
import { ImageBrick } from "./ImageBrick";
import { registry } from "./generative/ImageJsonRenderRegistry";
import { imageV1 } from "./imageV1";

export const imageFrontend = makeFrontend(imageV1, {
  registry,
  component: ImageBrick,
  breakpoints: {
    sm: { options: { form: ImageBreakpointOptionsForm } },
  },
});
