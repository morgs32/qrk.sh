import { swatchAndIconPreviewState } from "../definition/swatchAndIconPreviewState";
import { SwatchAndIconPreview } from "./SwatchAndIconPreview";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/SwatchAndIconJsonRenderRegistry";
import { swatchAndIconV1 } from "../definition/swatchAndIconV1";
import { SwatchAndIconForm } from "./SwatchAndIconForm";
import { SwatchAndIconLineIcon } from "./SwatchAndIconLineIcon";

const swatchAndIcon = makeModuleView(swatchAndIconV1, {
  defaultState: swatchAndIconPreviewState,
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
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${swatchAndIcon.label}`}>
        <swatchAndIcon.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
