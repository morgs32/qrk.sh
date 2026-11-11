import { articlePreviewState } from "@qrk.sh/zerospin/src/modules/article/articlePreviewState";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { IResult } from "@zerospin/error";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
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
    onSave: fn((_state: unknown): IResult<unknown, { message: string }> => ({
      _tag: "Success",
      success: undefined,
    })),
    registerFlush: fn((_flush: () => boolean) => () => {}),
    variantId: "default",
    spec: articleView.variants.default.spec,
  },
  render: function Render(props) {
    const { state, variantId, spec, ...surface } = props;
    const [savedState, setSavedState] = useState(state);
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl bg-zinc-50 p-4 sm:p-8">
        <BrickWrapper>
          <articleView.component
            state={savedState}
            variantId={variantId}
            spec={spec}
            {...(surface.mode === "studio"
              ? {
                  ...surface,
                  onSave: (nextState) => {
                    const result = surface.onSave(nextState);
                    if (result._tag === "Success") setSavedState(nextState);
                    return result;
                  },
                }
              : surface)}
          />
        </BrickWrapper>
      </main>
    );
  },
} satisfies Meta<typeof articleView.component>;

export default meta;

export const StudioEditor: StoryObj<typeof meta> = {};
export const UnconfiguredEditor: StoryObj<typeof meta> = { args: { state: null } };
export const BodyFirstAutosave: StoryObj<typeof meta> = {
  args: { state: null },
  play: async ({ args, canvasElement }) => {
    if (args.mode !== "studio") throw new Error("Expected the Studio editor");
    const body = await within(canvasElement).findByLabelText("Article content");
    await userEvent.type(body, "Body first");
    await waitFor(
      () =>
        expect(args.onSave).toHaveBeenCalledWith({
          title: "",
          subtitle: "",
          content: expect.stringMatching(/^Body first\s*$/),
        }),
      { timeout: 3000 },
    );
    expect(args.onSave).toHaveBeenCalledOnce();
    expect(body).toHaveFocus();
  },
};
