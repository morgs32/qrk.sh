import { linkPreviewState } from "@qrk.sh/zerospin/src/modules/link/linkPreviewState";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/LinkJsonRenderRegistry";
import { linkV1 } from "@qrk.sh/zerospin/src/modules/link/linkV1";
import { LinkPlaceholder } from "./LinkPlaceholder";
import { LinkForm } from "./LinkForm";
import { LinkLineIcon } from "./LinkLineIcon";

export const linkView = makeModuleView(linkV1, {
  defaultState: linkPreviewState,
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
      registry,
    },
  },
});
