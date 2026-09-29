import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/FigmaThumbnailJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";
import { figmaCardView } from "./FigmaCard";
import { figmaThumbnailBandView } from "./FigmaThumbnailBand";
import { figmaMediaFooterView } from "./FigmaMediaFooter";

export const figmaThumbnailView = makeModuleView(figmaThumbnailV1, {
  default: {
    component(props) {
      const { state } = props;
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
    generator: { registry, defaultSpec },
  },
});
