import { makeFrontend } from "../../make/makeFrontend";
import { FigmaBreakpointOptionsForm } from "./FigmaBreakpointOptionsForm";
import { registry } from "./generative/FigmaThumbnailJsonRenderRegistry";
import { figmaThumbnail } from "./figmaThumbnail";

export const figmaThumbnailFrontend = makeFrontend(figmaThumbnail, {
  registry,
  breakpoints: {
    sm: { options: { form: FigmaBreakpointOptionsForm } },
  },
});
