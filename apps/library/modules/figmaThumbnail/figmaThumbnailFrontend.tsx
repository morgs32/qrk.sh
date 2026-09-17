import { makeFrontend } from "../../make/makeFrontend";
import { FigmaBreakpointOptionsForm } from "./FigmaBreakpointOptionsForm";
import { FigmaThumbnailBrick } from "./FigmaThumbnailBrick";
import { registry } from "./generative/FigmaThumbnailJsonRenderRegistry";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";

export const figmaThumbnailFrontend = makeFrontend(figmaThumbnailV1, {
  registry,
  component: FigmaThumbnailBrick,
  breakpoints: {
    sm: { options: { form: FigmaBreakpointOptionsForm } },
  },
});
