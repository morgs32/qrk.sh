import { Schema } from "effect";
import { useContext } from "react";
import { imagePreviewState } from "../definition/imagePreviewState";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsContext, BrickDetailsTrigger } from "../../react/BrickDetailsTrigger";
import { useAfterBrickInserted } from "../../react/useAfterBrickInserted";
import { registry } from "./generator/ImageJsonRenderRegistry";
import { imageStateSchema, imageV2 } from "../definition/imageV2";
import { ImageForm } from "./ImageForm";
import { ImageLineIcon } from "./ImageLineIcon";

const image = makeModuleView(imageV2, {
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

const decodeState = Schema.decodeUnknownSync(imageStateSchema);

export const imageView = {
  ...image,
  Form(props: Parameters<NonNullable<typeof image.Form>>[0]) {
    const { state, onSave, onCancel, previewWidth, measureFrame } = props;
    const Form = image.Form;
    if (Form === undefined) return null;
    return (
      <Form
        state={state === null ? null : decodeState(state)}
        onSave={onSave}
        onCancel={onCancel}
        previewWidth={previewWidth}
        measureFrame={measureFrame}
      />
    );
  },
  Render(props: Parameters<typeof image.Render>[0]) {
    const { state, spec, variantId } = props;
    const openDetails = useContext(BrickDetailsContext);

    useAfterBrickInserted(() => {
      openDetails?.();
    });

    return (
      <BrickDetailsTrigger label={`Edit ${image.label}`}>
        <image.Render
          state={state === null ? null : decodeState(state)}
          spec={spec}
          variantId={variantId}
        />
      </BrickDetailsTrigger>
    );
  },
};
