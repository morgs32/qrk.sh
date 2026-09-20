import { makeModuleView } from "../../make/makeModuleView";
import { ImageBrick } from "./ImageBrick";
import { registry } from "./generator/ImageJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { imageV1 } from "./imageV1";

export const imageView = makeModuleView(imageV1, {
  default: {
    component: ImageBrick,
    generator: { registry, defaultSpec },
  },
});
