import { BrickDetailsTrigger } from "@qrk.sh/bricks/components/BrickDetailsTrigger";
import { linkView as link } from "@qrk.sh/bricks/modules/link/view";

export const linkView = {
  ...link,
  Render(props: Parameters<typeof link.Render>[0]) {
    const { brickState, placementState, spec, layoutId } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${link.label}`}>
        <link.Render brickState={brickState} placementState={placementState} spec={spec} layoutId={layoutId} />
      </BrickDetailsTrigger>
    );
  },
};
