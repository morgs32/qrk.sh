import { articlePreviewState } from "../definition/articlePreviewState";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { IResult } from "@zerospin/error";
import { useState } from "react";
import { fn } from "storybook/test";
import { BrickWrapper } from "../../../components/BrickWrapper";
import { ArticleEditor } from "./ArticleEditor";

const meta = {
  title: "Modules/Article",
  component: ArticleEditor,
  parameters: { layout: "fullscreen" },
  args: {
    state: articlePreviewState,
    onSave: fn((_state: unknown): IResult<unknown, { message: string }> => ({
      _tag: "Success",
      success: undefined,
    })),
    registerFlush: fn((_flush: (onRecover?: () => void) => boolean) => () => {}),
  },
  render: function Render(props) {
    const { state, onSave, registerFlush } = props;
    const [savedState, setSavedState] = useState(state);
    return (
      <main className="qrk-bricks mx-auto min-h-screen w-full max-w-3xl bg-zinc-50 p-4 sm:p-8">
        <BrickWrapper>
          <ArticleEditor
            state={savedState}
            onSave={(nextState) => {
              const result = onSave(nextState);
              if (result._tag === "Success") setSavedState(nextState);
              return result;
            }}
            registerFlush={registerFlush}
          />
        </BrickWrapper>
      </main>
    );
  },
} satisfies Meta<typeof ArticleEditor>;

export default meta;

export const StudioEditor: StoryObj<typeof meta> = {};
export const UnconfiguredEditor: StoryObj<typeof meta> = { args: { state: null } };
