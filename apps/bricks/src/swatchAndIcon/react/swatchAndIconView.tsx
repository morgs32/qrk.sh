import { swatchAndIconPreviewState } from "../definition/swatchAndIconPreviewState";
import { SwatchAndIconPreview } from "./SwatchAndIconPreview";
import { makeModuleView } from "../../react/makeModuleView";
import { registry } from "./generator/SwatchAndIconJsonRenderRegistry";
import { swatchAndIconV1 } from "../definition/swatchAndIconV1";
import { SwatchAndIconForm } from "./SwatchAndIconForm";
import { SwatchAndIconLineIcon } from "./SwatchAndIconLineIcon";

export const swatchAndIconView = makeModuleView(swatchAndIconV1, {
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
