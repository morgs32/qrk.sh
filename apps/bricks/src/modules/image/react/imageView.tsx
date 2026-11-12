import { Schema } from "effect";
import { imagePreviewState } from "../definition/imagePreviewState";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/ImageJsonRenderRegistry";
import { imageStateSchemaV3, imageV3 } from "../definition/imageV3";
import { ImageForm } from "./ImageForm";
import { ImageLineIcon } from "./ImageLineIcon";

const image = makeModuleView(imageV3, {
  categoryIds: ["tools"],
  defaultState: { imageUrl: imagePreviewState.imageUrl, altText: imagePreviewState.title, caption: imagePreviewState.title, crop: imagePreviewState.crop },
  previewStates: {
    captionless: { imageUrl: imagePreviewState.imageUrl, altText: imagePreviewState.title, caption: "", crop: imagePreviewState.crop },
    captioned: { imageUrl: imagePreviewState.imageUrl, altText: imagePreviewState.title, caption: imagePreviewState.title, crop: imagePreviewState.crop },
  },
  LineIcon: ImageLineIcon,
  form: ImageForm,
  variants: {
    default: {
      placeholder: ImagePlaceholder,
      registry,
    },
  },
});

export const imageView = {
  ...image,
  Render(props: Parameters<typeof image.Render>[0]) {
    const { state, spec, variantId } = props;
    if (state !== null && Schema.is(imageStateSchemaV3)(state) && state.imageUrl.trim() === "") {
      return <ImagePlaceholder />;
    }

    return (
      <BrickDetailsTrigger label={`Edit ${image.label}`}>
        <image.Render
          state={state}
          spec={spec}
          variantId={variantId}
        />
      </BrickDetailsTrigger>
    );
  },
};
