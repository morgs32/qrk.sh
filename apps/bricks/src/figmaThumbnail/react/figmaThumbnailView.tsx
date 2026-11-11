import { figmaThumbnailPreviewState } from "../definition/figmaThumbnailPreviewState";
import { makeModuleView } from "../../react/makeModuleView";
import { registry } from "./generator/FigmaThumbnailJsonRenderRegistry";
import { figmaThumbnailV1 } from "../definition/figmaThumbnailV1";
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
