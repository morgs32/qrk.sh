import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/FigmaThumbnailJsonRenderRegistry";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";
import { FigmaThumbnailForm } from "./FigmaThumbnailForm";
import { figmaCardView } from "./FigmaCard";
import { figmaThumbnailBandView } from "./FigmaThumbnailBand";
import { figmaMediaFooterView } from "./FigmaMediaFooter";
import { FigmaThumbnailPlaceholder } from "./FigmaThumbnailPlaceholder";
import { FigmaThumbnailLineIcon } from "./FigmaThumbnailLineIcon";

export const figmaThumbnailView = makeModuleView(figmaThumbnailV1, {
  LineIcon: FigmaThumbnailLineIcon,
  configureCommand: "configureFigmaThumbnail",
  form: FigmaThumbnailForm,
  default: {
    defaultWidth: 480,
    minWidth: 320,
    placeholder() {
      return <FigmaThumbnailPlaceholder />;
    },
    component(props) {
      const { state } = props;
      if (state.data === null)
        return <p role="status">{state.resolution.error?.message ?? "Resolving…"}</p>;
      return (
        <figmaCardView.Component>
          <figmaThumbnailBandView.Component
            imagePosition="left"
            thumbnail_height={state.data.thumbnail_height}
            thumbnail_url={state.data.thumbnail_url}
            thumbnail_width={state.data.thumbnail_width}
            title={state.data.title}
          />
          <figmaMediaFooterView.Component title={state.data.title} url={state.data.url} />
        </figmaCardView.Component>
      );
    },
    generator: { registry, defaultSpec: figmaThumbnailV1.defaultSpec },
  },
});
