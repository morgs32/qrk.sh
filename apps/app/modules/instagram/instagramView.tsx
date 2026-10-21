import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/InstagramJsonRenderRegistry";
import { instagramV1 } from "@qrk.sh/zerospin/src/modules/instagram/instagramV1";
import { InstagramForm } from "./InstagramForm";
import { instagramCardView } from "./InstagramCard";
import { instagramPostGridView } from "./InstagramPostGrid";
import { instagramMediaFooterView } from "./InstagramMediaFooter";
import { InstagramPlaceholder } from "./InstagramPlaceholder";
import { InstagramLineIcon } from "./InstagramLineIcon";

export const instagramView = makeModuleView(instagramV1, {
  LineIcon: InstagramLineIcon,
  form: InstagramForm,
  variants: {
    default: {
      defaultWidth: 400,
      minWidth: 320,
      defaultHeight: 360,
      placeholder() {
        return <InstagramPlaceholder />;
      },
      component(props) {
        const { state } = props;
        if (state.data === null) return <p role="status">This brick has no saved content.</p>;
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
  },
});
