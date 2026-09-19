import { makeModuleView } from "../../make/makeModuleView";
import { ImageBrick } from "./ImageBrick";
import { registry } from "./generative/ImageJsonRenderRegistry";
import { defaultSpec } from "./generative/defaultSpec";
import { imageV1 } from "./imageV1";

export const imageView = makeModuleView(imageV1, {
  default: {
    component: ImageBrick,
    generator: { registry, defaultSpec },
  },
});
