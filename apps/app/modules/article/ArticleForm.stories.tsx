import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { articleV1 } from "@qrk.sh/zerospin/src/modules/article/articleV1";
import { ArticleForm } from "./ArticleForm";

const meta = {
  title: "Modules/Article",
  parameters: { layout: "fullscreen" },
  args: { failSave: false },
  argTypes: {
    failSave: { control: "boolean", description: "Reject the production form's save callback." },
  },
} satisfies Meta<{ failSave: boolean }>;

export default meta;

export const Form: StoryObj<typeof meta> = {
  render: function Render(props) {
    const { failSave } = props;
    const [state, setState] = useState(articleV1.defaultState);
    const [status, setStatus] = useState("No changes saved.");

    return (
      <main className="min-h-screen bg-zinc-50 p-4 sm:p-8">
        <ArticleForm
          state={state}
          onSave={(nextState) => {
            if (failSave)
              return { _tag: "Failure", failure: { message: "Simulated Article save failure" } };
            setState(nextState);
            setStatus("Article saved.");
            return { _tag: "Success", success: undefined };
          }}
          onCancel={() => setStatus("Draft canceled.")}
        />
        <p role="status">{status}</p>
        <pre aria-label="Saved Article state" className="overflow-x-auto p-5 leading-6">
          {JSON.stringify(state, null, 2)}
        </pre>
      </main>
    );
  },
};

export const SaveFailure: StoryObj<typeof meta> = {
  ...Form,
  args: { failSave: true },
};
