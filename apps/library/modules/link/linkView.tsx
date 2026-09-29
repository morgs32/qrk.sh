import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/LinkJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { linkV1 } from "./linkV1";
import { linkCardView } from "./LinkCard";
import { linkCopyView } from "./LinkCopy";
import { linkHeroImageView } from "./LinkHeroImage";

export const linkView = makeModuleView(linkV1, {
  default: {
    component(props) {
      const { state } = props;
      return (
        <linkCardView.Component>
          <linkCopyView.Component
            iconUrl={state.data.iconUrl}
            siteName={state.data.siteName}
            title={state.data.title}
            url={state.data.url}
          />
          <linkHeroImageView.Component imageUrl={state.data.imageUrl} />
        </linkCardView.Component>
      );
    },
    generator: { registry, defaultSpec },
  },
  sm: { w: 8, h: 4 },
  md: { w: 8, h: 4 },
});
