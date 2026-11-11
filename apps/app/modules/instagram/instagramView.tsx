import { instagramPreviewState } from "@qrk.sh/zerospin/src/modules/instagram/instagramPreviewState";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/InstagramJsonRenderRegistry";
import { instagramV1 } from "@qrk.sh/zerospin/src/modules/instagram/instagramV1";
import { InstagramForm } from "./InstagramForm";
import { InstagramPlaceholder } from "./InstagramPlaceholder";
import { InstagramLineIcon } from "./InstagramLineIcon";

export const instagramView = makeModuleView(instagramV1, {
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
