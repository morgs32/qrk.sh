"use client";

import { useState } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Hash, Italic, List, ListOrdered, Pilcrow, Quote } from "lucide-react";

import { useProseDrawerStore } from "@/components/home/useProseDrawerStore";
import { Button } from "@/components/ui/button";

export function ProseDrawerTiptapBlock({ id, initialContent }: { id: string; initialContent: string }) {
  const [headingExpanded, setHeadingExpanded] = useState(false);
  const [htmlContent, setHtmlContent] = useState(initialContent);
  const updateBlock = useProseDrawerStore((s) => s.updateBlock);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write something...",
      }),
    ],
    content: initialContent,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      setHtmlContent(html);
      updateBlock(id, html);
    },
    editorProps: {
      attributes: {
        class: "tiptap focus:outline-none min-h-[120px] p-3",
      },
    },
  });

  if (!editor) {
    return null;
  }

  const getCurrentHeadingIcon = () => {
    if (editor.isActive("heading", { level: 1 })) {
      return (
        <>
          <Hash className="h-4 w-4" />
          <span className="absolute bottom-0.5 right-0 rounded-full border-2 border-background bg-background px-0.5 text-[11px] font-bold leading-none">
            1
          </span>
        </>
      );
    }
    if (editor.isActive("heading", { level: 2 })) {
      return (
        <>
          <Hash className="h-4 w-4" />
          <span className="absolute bottom-0.5 right-0 rounded-full border-2 border-background bg-background px-0.5 text-[11px] font-bold leading-none">
            2
          </span>
        </>
      );
    }
    if (editor.isActive("heading", { level: 3 })) {
      return (
        <>
          <Hash className="h-4 w-4" />
          <span className="absolute bottom-0.5 right-0 rounded-full border-2 border-background bg-background px-0.5 text-[11px] font-bold leading-none">
            3
          </span>
        </>
      );
    }
    if (editor.isActive("blockquote")) {
      return <Quote className="h-4 w-4" />;
    }
    return <Pilcrow className="h-4 w-4" />;
  };

  const setHeading = (level: number | null) => {
    if (level === null) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
    }
    setHeadingExpanded(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/10 p-4">
        <article className="prose-preview max-w-none" dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="flex flex-row items-center gap-1 rounded-lg border bg-muted/30 p-1 sm:flex-col sm:items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative h-8 w-8"
            onClick={() => setHeadingExpanded(!headingExpanded)}
            data-active={headingExpanded}
          >
            {getCurrentHeadingIcon()}
          </Button>

          {headingExpanded && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative h-8 w-8"
                onClick={() => setHeading(1)}
                data-active={editor.isActive("heading", { level: 1 })}
              >
                <Hash className="h-4 w-4" />
                <span className="absolute bottom-0.5 right-0 rounded-full border-2 border-background bg-background px-0.5 text-[11px] font-bold leading-none">
                  1
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative h-8 w-8"
                onClick={() => setHeading(2)}
                data-active={editor.isActive("heading", { level: 2 })}
              >
                <Hash className="h-4 w-4" />
                <span className="absolute bottom-0.5 right-0 rounded-full border-2 border-background bg-background px-0.5 text-[11px] font-bold leading-none">
                  2
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative h-8 w-8"
                onClick={() => setHeading(3)}
                data-active={editor.isActive("heading", { level: 3 })}
              >
                <Hash className="h-4 w-4" />
                <span className="absolute bottom-0.5 right-0 rounded-full border-2 border-background bg-background px-0.5 text-[11px] font-bold leading-none">
                  3
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setHeading(null)}
                data-active={!editor.isActive("heading") && !editor.isActive("blockquote")}
              >
                <Pilcrow className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  editor.chain().focus().toggleBlockquote().run();
                  setHeadingExpanded(false);
                }}
                data-active={editor.isActive("blockquote")}
              >
                <Quote className="h-4 w-4" />
              </Button>
              <hr className="my-1 hidden w-full border-t border-border sm:block" />
            </>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => editor.chain().focus().toggleBold().run()}
            data-active={editor.isActive("bold")}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            data-active={editor.isActive("italic")}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            data-active={editor.isActive("bulletList")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            data-active={editor.isActive("orderedList")}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-[120px] min-w-0 flex-1 rounded-lg border">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
