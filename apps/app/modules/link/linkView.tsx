import { linkV1 } from "@qrk.sh/bricks/link/definition";
import { linkPreviewState } from "@qrk.sh/bricks/link/definition/linkPreviewState";
import { LinkForm } from "@qrk.sh/bricks/link/LinkForm";
import { LinkLineIcon } from "@qrk.sh/bricks/link/LinkLineIcon";
import { LinkPlaceholder } from "@qrk.sh/bricks/link/LinkPlaceholder";
import { linkReactRegistry } from "@qrk.sh/bricks/link/react";
import { makeModuleView } from "@qrk.sh/bricks/react/makeModuleView";
import { BrickDetailsTrigger } from "@qrk.sh/bricks/react/BrickDetailsTrigger";
import type { LibraryApi } from "@qrk.sh/bricks/rpc";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";

async function lookupLinkPreview(url: string, signal: AbortSignal) {
  signal.throwIfAborted();
  using api = newSyncRpcSession<LibraryApi>("/rpc");
  const close = () => api[Symbol.dispose]();
  signal.addEventListener("abort", close, { once: true });
  try {
    return await api.linkBackend().getPreview(url);
  } finally {
    signal.removeEventListener("abort", close);
  }
}

const link = makeModuleView(linkV1, {
  defaultState: linkPreviewState,
  LineIcon: LinkLineIcon,
  form(props) {
    const { state, onSave } = props;
    return (
      <LinkForm
        state={state}
        onSave={onSave}
        lookupLinkPreview={lookupLinkPreview}
      />
    );
  },
  variants: {
    default: {
      placeholder() {
        return <LinkPlaceholder />;
      },
      registry: linkReactRegistry,
    },
  },
});

export const linkView = {
  ...link,
  Render(props: Parameters<typeof link.Render>[0]) {
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${link.label}`}>
        <link.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
