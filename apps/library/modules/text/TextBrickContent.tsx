"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Schema } from "effect";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";

type TiptapDoc = Schema.Schema.Type<typeof TiptapDocSchema>;

const emptyPlaceholder = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Start writing…" }],
    },
  ],
};

export function TextBrickContent(props: { content: TiptapDoc | null }) {
  const editor = useEditor(
    {
      extensions: [StarterKit],
      content:
        props.content === null ? emptyPlaceholder : JSON.parse(JSON.stringify(props.content)),
      editable: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          "aria-label": "Text content",
          class: "min-h-0 px-4 py-3 outline-none",
        },
      },
    },
    [props.content],
  );

  if (editor === null) {
    return null;
  }

  return (
    <div className="size-full min-h-0 overflow-auto bg-background">
      <EditorContent editor={editor} />
    </div>
  );
}
