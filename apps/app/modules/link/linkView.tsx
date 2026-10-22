import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/LinkJsonRenderRegistry";
import { linkV1 } from "@qrk.sh/zerospin/src/modules/link/linkV1";
import { linkCardView } from "./LinkCard";
import { linkCopyView } from "./LinkCopy";
import { linkHeroImageView } from "./LinkHeroImage";
import { LinkPlaceholder } from "./LinkPlaceholder";
import { LinkForm } from "./LinkForm";
import { LinkLineIcon } from "./LinkLineIcon";

export const linkView = makeModuleView(linkV1, {
  LineIcon: LinkLineIcon,
  form(props) {
    const { state, onSave, onCancel } = props;
    return <LinkForm state={state} onSave={onSave} onCancel={onCancel} />;
  },
  variants: {
    default: {
      placeholder() {
        return <LinkPlaceholder />;
      },
      component(props) {
        const { state } = props;
        if (state.data === null) return <p role="status">This brick has no saved content.</p>;
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
      generator: { registry, defaultSpec: linkV1.defaultSpec },
    },
  },
});
