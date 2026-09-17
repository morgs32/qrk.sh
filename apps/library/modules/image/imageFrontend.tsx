import { makeFrontend } from "../../make/makeFrontend";
import { ImageBreakpointOptionsForm } from "./ImageBreakpointOptionsForm";
import { ImageBrick } from "./ImageBrick";
import { registry } from "./generative/ImageJsonRenderRegistry";
import { image } from "./image";

export const imageFrontend = makeFrontend(image, {
  registry,
  component: ImageBrick,
  breakpoints: {
    sm: { options: { form: ImageBreakpointOptionsForm } },
  },
});
