import { imagePreviewState } from "../definition/imagePreviewState";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { makeModuleView } from "../../react/makeModuleView";
import { registry } from "./generator/ImageJsonRenderRegistry";
import { imageV1 } from "../definition/imageV1";
import { ImageForm } from "./ImageForm";
import { ImageLineIcon } from "./ImageLineIcon";

export const imageView = makeModuleView(imageV1, {
  defaultState: imagePreviewState,
  LineIcon: ImageLineIcon,
  form: ImageForm,
  variants: {
    default: {
      placeholder: ImagePlaceholder,
      registry,
    },
  },
});
