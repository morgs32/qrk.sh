"use client";

import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";

import { Button } from "../../ui/button";

export function TextEditorControl(props: {
  value: JSONContent | null;
  onChange: (value: JSONContent) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: props.value ?? {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Start writing…" }],
        },
      ],
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Text content",
        class:
          "min-h-48 px-4 py-3 text-sm leading-6 outline-none [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-6",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const document = updatedEditor.getJSON();
      props.onChange(document);
    },
  });

  if (editor === null) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap gap-1 border-b border-border bg-muted/30 p-1.5">
        <Button
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
          className="size-8"
          disabled={!editor.can().chain().focus().toggleBold().run()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          size="icon"
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
        >
          <Bold className="size-4" />
        </Button>
        <Button
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
          className="size-8"
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          size="icon"
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
        >
          <Italic className="size-4" />
        </Button>
        <Button
          aria-label="Strikethrough"
          aria-pressed={editor.isActive("strike")}
          className="size-8"
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          size="icon"
          type="button"
          variant={editor.isActive("strike") ? "secondary" : "ghost"}
        >
          <Strikethrough className="size-4" />
        </Button>
        <Button
          aria-label="Inline code"
          aria-pressed={editor.isActive("code")}
          className="size-8"
          disabled={!editor.can().chain().focus().toggleCode().run()}
          onClick={() => editor.chain().focus().toggleCode().run()}
          size="icon"
          type="button"
          variant={editor.isActive("code") ? "secondary" : "ghost"}
        >
          <Code className="size-4" />
        </Button>
        <Button
          aria-label="Heading 1"
          aria-pressed={editor.isActive("heading", { level: 1 })}
          className="size-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          size="icon"
          type="button"
          variant={editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
        >
          <Heading1 className="size-4" />
        </Button>
        <Button
          aria-label="Heading 2"
          aria-pressed={editor.isActive("heading", { level: 2 })}
          className="size-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          size="icon"
          type="button"
          variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
        >
          <Heading2 className="size-4" />
        </Button>
        <Button
          aria-label="Bullet list"
          aria-pressed={editor.isActive("bulletList")}
          className="size-8"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          size="icon"
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
        >
          <List className="size-4" />
        </Button>
        <Button
          aria-label="Ordered list"
          aria-pressed={editor.isActive("orderedList")}
          className="size-8"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          size="icon"
          type="button"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
        >
          <ListOrdered className="size-4" />
        </Button>
        <Button
          aria-label="Blockquote"
          aria-pressed={editor.isActive("blockquote")}
          className="size-8"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          size="icon"
          type="button"
          variant={editor.isActive("blockquote") ? "secondary" : "ghost"}
        >
          <Quote className="size-4" />
        </Button>
        <Button
          aria-label="Undo"
          className="ml-auto size-8"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          aria-label="Redo"
          className="size-8"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Redo2 className="size-4" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
