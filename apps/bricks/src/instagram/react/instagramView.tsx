import { instagramPreviewState } from "../definition/instagramPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { registry } from "./generator/InstagramJsonRenderRegistry";
import { instagramV1 } from "../definition/instagramV1";
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
