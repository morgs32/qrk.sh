import { figmaThumbnailPreviewState } from "@qrk.sh/zerospin/src/modules/figmaThumbnail/figmaThumbnailPreviewState";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/FigmaThumbnailJsonRenderRegistry";
import { figmaThumbnailV1 } from "@qrk.sh/zerospin/src/modules/figmaThumbnail/figmaThumbnailV1";
import { FigmaThumbnailForm } from "./FigmaThumbnailForm";
import { FigmaThumbnailPlaceholder } from "./FigmaThumbnailPlaceholder";
import { FigmaThumbnailLineIcon } from "./FigmaThumbnailLineIcon";

export const figmaThumbnailView = makeModuleView(figmaThumbnailV1, {
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
