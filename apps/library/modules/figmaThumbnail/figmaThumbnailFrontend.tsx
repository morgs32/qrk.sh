import { makeModuleView } from "../../make/makeModuleView";
import { FigmaThumbnailBrick } from "./FigmaThumbnailBrick";
import { registry } from "./generative/FigmaThumbnailJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";

export const figmaThumbnailFrontend = makeModuleView(figmaThumbnailV1, {
  default: {
    component: FigmaThumbnailBrick,
    generator: { registry, defaultSpec },
  },
});
