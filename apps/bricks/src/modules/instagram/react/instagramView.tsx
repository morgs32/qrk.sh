import { addBrick, updateBrick } from "../commands/brickActions";
import { instagramPreviewState } from "../definition/instagramPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/InstagramJsonRenderRegistry";
import { instagramV1 } from "../definition/instagramV1";
import { InstagramForm } from "./InstagramForm";
import { InstagramPlaceholder } from "./InstagramPlaceholder";
import { InstagramLineIcon } from "./InstagramLineIcon";

const instagram = makeModuleView(instagramV1, {
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  categoryIds: ["social"],
  defaultState: instagramPreviewState,
  LineIcon: InstagramLineIcon,
  form: InstagramForm,
  variants: {
    default: {
      placeholder() {
        return <InstagramPlaceholder />;
      },
      registry,
    },
  },
});

export const instagramView = {
  ...instagram,
  Render(props: Parameters<typeof instagram.Render>[0]) {
    const { brickState, placementState, layoutId, spec } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${instagram.label}`}>
        <instagram.Render brickState={brickState} placementState={placementState} spec={spec} layoutId={layoutId} />
      </BrickDetailsTrigger>
    );
  },
};
