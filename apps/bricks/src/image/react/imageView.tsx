import { useContext } from "react";
import { imagePreviewState } from "../definition/imagePreviewState";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsContext, BrickDetailsTrigger } from "../../react/BrickDetailsTrigger";
import { useAfterBrickInserted } from "../../react/useAfterBrickInserted";
import { registry } from "./generator/ImageJsonRenderRegistry";
import { imageV1 } from "../definition/imageV1";
import { ImageForm } from "./ImageForm";
import { ImageLineIcon } from "./ImageLineIcon";

const image = makeModuleView(imageV1, {
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

export const imageView = {
  ...image,
  Render(props: Parameters<typeof image.Render>[0]) {
    const { state, spec, variantId } = props;
    const openDetails = useContext(BrickDetailsContext);

    useAfterBrickInserted(() => {
      openDetails?.();
    });

    return (
      <BrickDetailsTrigger label={`Edit ${image.label}`}>
        <image.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
