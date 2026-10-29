import { SwatchAndIcon } from "./SwatchAndIcon";
import { SwatchAndIconPreview } from "./SwatchAndIconPreview";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/SwatchAndIconJsonRenderRegistry";
import { swatchAndIconV1 } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconV1";
import { SwatchAndIconForm } from "./SwatchAndIconForm";
import { SwatchAndIconLineIcon } from "./SwatchAndIconLineIcon";

export const swatchAndIconView = makeModuleView(swatchAndIconV1, {
  LineIcon: SwatchAndIconLineIcon,
  form: SwatchAndIconForm,
  variants: {
    default: {
      component: SwatchAndIcon,
      preview: SwatchAndIconPreview,
      generator: { registry, defaultSpec: swatchAndIconV1.defaultSpec },
    },
  },
});
