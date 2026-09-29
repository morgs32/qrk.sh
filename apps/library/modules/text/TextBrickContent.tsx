"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { makeComponentView } from "../../make/makeComponentView";
import { textBrickComponent } from "./generator/TextBrickComponent";

const emptyPlaceholder = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Start writing…" }],
    },
  ],
};

export const textBrickContentView = makeComponentView(textBrickComponent, {
  component(props) {
    const { content } = props;
    const editor = useEditor(
      {
        extensions: [StarterKit],
        content: content === null ? emptyPlaceholder : JSON.parse(JSON.stringify(content)),
        editable: false,
        immediatelyRender: false,
        editorProps: {
          attributes: {
            "aria-label": "Text content",
            class: "min-h-0 px-4 py-3 outline-none",
          },
        },
      },
      [content],
    );

    if (editor === null) {
      return null;
    }

    return (
      <div className="size-full min-h-0 overflow-auto bg-background">
        <EditorContent editor={editor} />
      </div>
    );
  },
});
