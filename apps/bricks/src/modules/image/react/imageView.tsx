import { addBrick, updateBrick } from "../commands/brickActions";
import * as Schema from "effect/Schema";
import type { IModule } from "../../react/types";
import { imagePreviewState } from "../definition/imagePreviewState";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/ImageJsonRenderRegistry";
import { imageStateSchemaV4, imageV4 } from "../definition/imageV4";
import { ImageForm } from "./ImageForm";
import { ImageLineIcon } from "./ImageLineIcon";

const decodeImageState = Schema.decodeUnknownSync(imageStateSchemaV4);

const captionlessPreview = {
  imageUrl: imagePreviewState.imageUrl,
  altText: imagePreviewState.title,
  caption: "",
  crop: imagePreviewState.crop,
  round: false,
};

const image = makeModuleView(imageV4, {
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  categoryIds: ["tools"],
  defaultState: { ...captionlessPreview, caption: imagePreviewState.title },
  previewStates: {
    captionless: captionlessPreview,
    captioned: { ...captionlessPreview, caption: imagePreviewState.title },
    round: { ...captionlessPreview, round: true },
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
  initialDrafts: {
    round: { imageUrl: "", altText: "", caption: "", crop: null, round: true },
  },
  Form(props: Parameters<NonNullable<IModule<"image">["Form"]>>[0]) {
    const { state, ...formProps } = props;
    const decoded = state === null ? null : decodeImageState(state, { onExcessProperty: "ignore" });
    return <ImageForm {...formProps} state={decoded} />;
  },
  Render(props: Parameters<typeof image.Render>[0]) {
    const { brickState, placementState, spec, layoutId } = props;
    const decoded = brickState === null ? null : decodeImageState(brickState, { onExcessProperty: "ignore" });
    if (decoded !== null && decoded.imageUrl.trim() === "") {
      return <ImagePlaceholder round={decoded.round} />;
    }

    return (
      <BrickDetailsTrigger label={`Edit ${image.label}`}>
        <image.Render brickState={decoded} placementState={placementState} spec={spec} layoutId={layoutId} />
      </BrickDetailsTrigger>
    );
  },
};
