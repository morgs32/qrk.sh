import { makeFrontend } from "../../make/makeFrontend";
import { ImageBreakpointOptionsForm } from "./ImageBreakpointOptionsForm";
import { registry } from "./generative/ImageJsonRenderRegistry";
import { image } from "./image";

export const imageFrontend = makeFrontend(image, {
  registry,
  breakpoints: {
    sm: { options: { form: ImageBreakpointOptionsForm } },
  },
});
