import { instagramPreviewState } from "../definition/instagramPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/InstagramJsonRenderRegistry";
import { instagramV1 } from "../definition/instagramV1";
import { InstagramForm } from "./InstagramForm";
import { InstagramPlaceholder } from "./InstagramPlaceholder";
import { InstagramLineIcon } from "./InstagramLineIcon";

const instagram = makeModuleView(instagramV1, {
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
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${instagram.label}`}>
        <instagram.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
