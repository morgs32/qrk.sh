import { figmaThumbnailPreviewState } from "../definition/figmaThumbnailPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../react/BrickDetailsTrigger";
import { registry } from "./generator/FigmaThumbnailJsonRenderRegistry";
import { figmaThumbnailV1 } from "../definition/figmaThumbnailV1";
import { FigmaThumbnailForm } from "./FigmaThumbnailForm";
import { FigmaThumbnailPlaceholder } from "./FigmaThumbnailPlaceholder";
import { FigmaThumbnailLineIcon } from "./FigmaThumbnailLineIcon";

const figmaThumbnail = makeModuleView(figmaThumbnailV1, {
  defaultState: figmaThumbnailPreviewState,
  LineIcon: FigmaThumbnailLineIcon,
  form: FigmaThumbnailForm,
  variants: {
    default: {
      placeholder() {
        return <FigmaThumbnailPlaceholder />;
      },
      registry,
    },
  },
});

export const figmaThumbnailView = {
  ...figmaThumbnail,
  Render(props: Parameters<typeof figmaThumbnail.Render>[0]) {
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${figmaThumbnail.label}`}>
        <figmaThumbnail.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
