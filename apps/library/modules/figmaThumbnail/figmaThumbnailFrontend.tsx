import { makeFrontend } from "../../make/makeFrontend";
import { FigmaThumbnailBrick } from "./FigmaThumbnailBrick";
import { registry } from "./generative/FigmaThumbnailJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";

export const figmaThumbnailFrontend = makeFrontend(figmaThumbnailV1, {
  registry,
  component: FigmaThumbnailBrick,
  defaultSpec,
});
