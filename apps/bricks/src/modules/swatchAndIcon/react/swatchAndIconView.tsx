import { addBrick, updateBrick } from "../commands/brickActions";
import { swatchAndIconPreviewState } from "../definition/swatchAndIconPreviewState";
import { SwatchAndIconPreview } from "./SwatchAndIconPreview";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/SwatchAndIconJsonRenderRegistry";
import { swatchAndIconV1 } from "../definition/swatchAndIconV1";
import { SwatchAndIconForm } from "./SwatchAndIconForm";
import { SwatchAndIconLineIcon } from "./SwatchAndIconLineIcon";

const swatchAndIcon = makeModuleView(swatchAndIconV1, {
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  categoryIds: ["tools"],
  defaultState: swatchAndIconPreviewState,
  initialDraft: "preview",
  LineIcon: SwatchAndIconLineIcon,
  form: SwatchAndIconForm,
  variants: {
    default: {
      preview: SwatchAndIconPreview,
      registry,
    },
  },
});

export const swatchAndIconView = {
  ...swatchAndIcon,
  Render(props: Parameters<typeof swatchAndIcon.Render>[0]) {
    const { brickState, placementState, layoutId, spec } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${swatchAndIcon.label}`}>
        <swatchAndIcon.Render brickState={brickState} placementState={placementState} spec={spec} layoutId={layoutId} />
      </BrickDetailsTrigger>
    );
  },
};
