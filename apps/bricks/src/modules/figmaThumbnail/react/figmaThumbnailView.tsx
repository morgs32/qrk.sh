import { addBrick, updateBrick } from "../commands/brickActions";
import { figmaThumbnailPreviewState } from "../definition/figmaThumbnailPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/FigmaThumbnailJsonRenderRegistry";
import { figmaThumbnailV1 } from "../definition/figmaThumbnailV1";
import { FigmaThumbnailForm } from "./FigmaThumbnailForm";
import { FigmaThumbnailPlaceholder } from "./FigmaThumbnailPlaceholder";
import { FigmaThumbnailLineIcon } from "./FigmaThumbnailLineIcon";

const figmaThumbnail = makeModuleView(figmaThumbnailV1, {
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  categoryIds: ["tools"],
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
    const { brickState, placementState, layoutId, spec } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${figmaThumbnail.label}`}>
        <figmaThumbnail.Render brickState={brickState} placementState={placementState} spec={spec} layoutId={layoutId} />
      </BrickDetailsTrigger>
    );
  },
};
