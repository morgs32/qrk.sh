import { MeowdownEditor, type EditorHandle } from "@meowdown/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useRef, useState } from "react";
import { ArticleForm } from "./ArticleForm";
import { articleV1 } from "./articleV1";
import "./article-font.css";
import "./article-editor.scss";

const meta: Meta<{ mode: "hide" | "focus" | "show"; failSave: boolean }> = {
  title: "Library/Article/Meowdown spike",
  parameters: {
    layout: "fullscreen",
  },
  args: {
    mode: "focus",
    failSave: false,
  },
  argTypes: {
    failSave: { control: "boolean", description: "Reject the production form's save callback." },
    mode: {
      control: {
        type: "radio",
        labels: { hide: "Hide", focus: "Hybrid", show: "Show" },
      },
      options: ["hide", "focus", "show"],
    },
  },
};

export const Form: StoryObj<typeof meta> = {
  argTypes: { mode: { control: false, table: { disable: true } } },
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

export default meta;

export const Default: StoryObj<typeof meta> = {
  render: function Render(props) {
    const { mode } = props;
    const fixture = `# A Markdown-first article

Edit **bold**, *italic*, and [linked text](https://example.com) directly.

## Lists and tasks

- Keep the Markdown close
  - Including nested items
- Try another bullet

1. Write a little
2. See the Markdown update

- [x] Open the editor
- [ ] Compare Hide, Hybrid, and Show

> A quote keeps its Markdown shape.

## Code and tables

Use \`inline code\` in a sentence.

\`\`\`ts
const greeting = "Hello, Meowdown";
\`\`\`

| Feature | Try it |
| --- | --- |
| Syntax | Move the cursor |
| History | Undo and redo |
`;
    const editorRef = useRef<EditorHandle>(null);
    // 1. Seed once; changing mode keeps the editor and its edits mounted.
    const [markdown, setMarkdown] = useState(fixture);
    // 2. A stable callback reads the mounted editor's Markdown serialization.
    const handleDocChange = useCallback(() => {
      if (editorRef.current !== null) setMarkdown(editorRef.current.getMarkdown());
    }, []);
    const resolveXPost = useCallback(() => undefined, []);
    const resolveYouTubeVideo = useCallback(() => undefined, []);

    return (
      <main className="meowdown-spike min-h-screen bg-zinc-50 p-4 sm:p-8">
        <header className="mb-6">
          <h1 className="font-semibold">Meowdown spike</h1>
          <p className="mt-2">
            Edit the article and compare its Markdown. Use the mode control to hide syntax, reveal
            it near the cursor, or show it everywhere.
          </p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section
            aria-labelledby="meowdown-editor-heading"
            className="min-w-0 rounded-lg border border-zinc-200 bg-white"
          >
            <h2
              id="meowdown-editor-heading"
              className="border-b border-zinc-200 px-5 py-3 font-semibold"
            >
              Editable article
            </h2>
            <MeowdownEditor
              initialMarkdown={fixture}
              mode={mode}
              handleRef={editorRef}
              onDocChange={handleDocChange}
              editorClassName="qrk-article-editor"
              embedPaste={false}
              resolveXPost={resolveXPost}
              resolveYouTubeVideo={resolveYouTubeVideo}
            />
          </section>

          <section
            aria-labelledby="meowdown-markdown-heading"
            className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white"
          >
            <h2
              id="meowdown-markdown-heading"
              className="border-b border-zinc-200 px-5 py-3 font-semibold"
            >
              Live Markdown
            </h2>
            <pre className="overflow-x-auto p-5 leading-6">{markdown}</pre>
          </section>
        </div>
      </main>
    );
  },
};
