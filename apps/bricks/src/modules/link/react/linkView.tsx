import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import type { BricksApi } from "../../../rpc/BricksApi";
import { makeModuleView } from "../../react/makeModuleView";
import { addBrick, updateBrick } from "../commands/brickActions";
import { linkPreviewState } from "../definition/linkPreviewState";
import { linkV1 } from "../definition/linkV1";
import { LinkForm } from "./LinkForm";
import { LinkLineIcon } from "./LinkLineIcon";
import { LinkPlaceholder } from "./LinkPlaceholder";
import { linkReactRegistry } from "./LinkJsonRenderRegistry";

async function lookupLinkPreview(url: string, signal: AbortSignal) {
  signal.throwIfAborted();
  using api = newSyncRpcSession<BricksApi>("/rpc");
  const close = () => api[Symbol.dispose]();
  signal.addEventListener("abort", close, { once: true });
  try {
    return await api.linkBackend().getPreview(url);
  } finally {
    signal.removeEventListener("abort", close);
  }
}

export const linkView = makeModuleView(linkV1, {
  categoryIds: ["business", "tools"],
  defaultState: linkPreviewState,
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  LineIcon: LinkLineIcon,
  form(props) {
    const { state, onSave, onDraftChange } = props;
    return (
      <LinkForm
        state={state}
        onSave={onSave}
        onDraftChange={onDraftChange}
        lookupLinkPreview={lookupLinkPreview}
      />
    );
  },
  variants: {
    default: {
      placeholder: LinkPlaceholder,
      registry: linkReactRegistry,
    },
  },
});
