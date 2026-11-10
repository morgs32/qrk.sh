import { articlePreviewState } from "@qrk.sh/zerospin/src/modules/article/articlePreviewState";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BrickWrapper } from "../components/brick/BrickWrapper";
import { articleView } from "./articleView";

const meta = {
  title: "Modules/Article",
  component: articleView.component,
  parameters: { layout: "fullscreen" },
  args: {
    state: articlePreviewState,
    mode: "studio",
    onFocus: fn(),
    renderDrawer: () => null,
    variantId: "default",
    spec: articleView.variants.default.spec,
  },
  render(props) {
    const { state, variantId, spec, ...surface } = props;
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl bg-zinc-50 p-4 sm:p-8">
        <BrickWrapper>
          <articleView.component state={state} variantId={variantId} spec={spec} {...surface} />
        </BrickWrapper>
      </main>
    );
  },
} satisfies Meta<typeof articleView.component>;

export default meta;

export const StudioEditor: StoryObj<typeof meta> = {};
export const UnconfiguredEditor: StoryObj<typeof meta> = { args: { state: null } };
