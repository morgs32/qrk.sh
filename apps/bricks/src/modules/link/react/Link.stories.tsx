import type { Meta, StoryObj } from "@storybook/react-vite";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { BrickStory } from "../../../../.storybook/BrickStory";
import { makeModuleView } from "../../react/makeModuleView";
import type { BricksApi } from "@qrk.sh/bricks/rpc";
import { linkPreviewState } from "../definition/linkPreviewState";
import { linkV1 } from "../definition/linkV1";
import { linkCardView } from "./LinkCard";
import { linkCopyView } from "./LinkCopy";
import { LinkForm } from "./LinkForm";
import { linkHeroImageView } from "./LinkHeroImage";
import { linkReactRegistry } from "./LinkJsonRenderRegistry";
import { LinkLineIcon } from "./LinkLineIcon";
import { LinkPlaceholder } from "./LinkPlaceholder";
import illustrationUrl from "./story-illustration.svg?url";

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

const view = makeModuleView(linkV1, {
  defaultState: linkPreviewState,
  LineIcon: LinkLineIcon,
  form(props) {
    const { state, onSave } = props;
    return <LinkForm state={state} onSave={onSave} lookupLinkPreview={lookupLinkPreview} />;
  },
  variants: {
    default: {
      placeholder: LinkPlaceholder,
      registry: linkReactRegistry,
    },
  },
});

const meta = {
  title: "Modules/Link",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        illustrationUrl={illustrationUrl}
        key={fixture}
        definition={linkV1}
        view={view}
        fixture={fixture}
        renderSketch={(state) => {
          const { data } = state;
          if (data === null) return null;
          return (
            <linkCardView.Component>
              <linkCopyView.Component
                iconUrl={data.iconUrl}
                siteName={data.siteName}
                title={data.title}
                url={data.url}
              />
              <linkHeroImageView.Component imageUrl={data.imageUrl} />
            </linkCardView.Component>
          );
        }}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
