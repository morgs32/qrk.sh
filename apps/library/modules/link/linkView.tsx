import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/LinkJsonRenderRegistry";
import { linkV1 } from "./linkV1";
import { linkCardView } from "./LinkCard";
import { linkCopyView } from "./LinkCopy";
import { linkHeroImageView } from "./LinkHeroImage";
import { LinkPlaceholder } from "./LinkPlaceholder";
import { LinkForm } from "./LinkForm";
import { LinkLineIcon } from "./LinkLineIcon";

export const linkView = makeModuleView(linkV1, {
  LineIcon: LinkLineIcon,
  configureCommand: "configureLink",
  form(props) {
    const { state, onConfigure, onCancel } = props;
    return <LinkForm state={state} onConfigure={onConfigure} onCancel={onCancel} />;
  },
  default: {
    defaultWidth: 480,
    placeholder() {
      return <LinkPlaceholder />;
    },
    component(props) {
      const { state } = props;
      if (state.data === null)
        return <p role="status">{state.resolution.error?.message ?? "Resolving…"}</p>;
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
});
