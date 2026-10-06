import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/InstagramJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { instagramV1 } from "./instagramV1";
import { instagramCardView } from "./InstagramCard";
import { instagramPostGridView } from "./InstagramPostGrid";
import { instagramMediaFooterView } from "./InstagramMediaFooter";
import { InstagramPlaceholder } from "./InstagramPlaceholder";

export const instagramView = makeModuleView(instagramV1, {
  default: {
    placeholder() {
      return <InstagramPlaceholder />;
    },
    component(props) {
      const { state } = props;
      return (
        <instagramCardView.Component username={state.data.username}>
          <instagramPostGridView.Component
            postImageUrls={state.data.postImageUrls}
            username={state.data.username}
          />
          <instagramMediaFooterView.Component
            followersText={state.data.followersText}
            username={state.data.username}
          />
        </instagramCardView.Component>
      );
    },
    generator: { registry, defaultSpec },
  },
});
