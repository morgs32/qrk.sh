import { makeFrontend } from "../../make/makeFrontend";
import { FigmaBreakpointOptionsForm } from "./FigmaBreakpointOptionsForm";
import { FigmaThumbnailBrick } from "./FigmaThumbnailBrick";
import { registry } from "./generative/FigmaThumbnailJsonRenderRegistry";
import { figmaThumbnail } from "./figmaThumbnail";

export const figmaThumbnailFrontend = makeFrontend(figmaThumbnail, {
  registry,
  component: FigmaThumbnailBrick,
  breakpoints: {
    sm: { options: { form: FigmaBreakpointOptionsForm } },
  },
});
