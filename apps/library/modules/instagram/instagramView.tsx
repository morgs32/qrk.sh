import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/InstagramJsonRenderRegistry";
import { instagramV1 } from "./instagramV1";
import { InstagramForm } from "./InstagramForm";
import { instagramCardView } from "./InstagramCard";
import { instagramPostGridView } from "./InstagramPostGrid";
import { instagramMediaFooterView } from "./InstagramMediaFooter";
import { InstagramPlaceholder } from "./InstagramPlaceholder";
import { InstagramLineIcon } from "./InstagramLineIcon";

export const instagramView = makeModuleView(instagramV1, {
  LineIcon: InstagramLineIcon,
  configureCommand: "configureInstagram",
  form: InstagramForm,
  default: {
    defaultWidth: 400,
    minWidth: 320,
    placeholder() {
      return <InstagramPlaceholder />;
    },
    component(props) {
      const { state } = props;
      if (state.data === null)
        return <p role="status">{state.resolution.error?.message ?? "Resolving…"}</p>;
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
    generator: { registry, defaultSpec: instagramV1.defaultSpec },
  },
});
