import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/InstagramJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { instagramV1 } from "./instagramV1";
import { instagramCardView } from "./InstagramCard";
import { instagramPostGridView } from "./InstagramPostGrid";
import { instagramMediaFooterView } from "./InstagramMediaFooter";

export const instagramView = makeModuleView(instagramV1, {
  default: {
    component(props) {
      const { state } = props;
      return (
        <instagramCardView.Component username={state.data.username}>
          <instagramPostGridView.Component
            postImageUrl1={state.data.postImageUrl1}
            postImageUrl2={state.data.postImageUrl2}
            postImageUrl3={state.data.postImageUrl3}
            postImageUrl4={state.data.postImageUrl4}
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
