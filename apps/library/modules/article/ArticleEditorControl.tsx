"use client";

import DragHandle from "@tiptap/extension-drag-handle-react";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { Typography } from "@tiptap/extension-typography";
import { Underline } from "@tiptap/extension-underline";
import { Selection } from "@tiptap/extensions";
import { EditorContent, EditorContext, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { GripVertical } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import ImageResize from "tiptap-extension-resize-image";

import { ArticleToolbar } from "./ArticleToolbar";
import { HorizontalRule } from "./tiptap/node/horizontal-rule-node/horizontal-rule-node-extension";
import { ImageUploadNode } from "./tiptap/node/image-upload-node/image-upload-node-extension";
import "./article-font.css";
import "./article-editor.scss";

export function ArticleEditorControl(props: {
  title: string;
  subtitle: string;
  value: JSONContent | null;
  drawer: {
    onTitleChange: (title: string) => void;
    onSubtitleChange: (subtitle: string) => void;
    onChange: (document: JSONContent) => void;
  };
}) {
  const { title, subtitle, value, drawer } = props;
  const current = useRef(drawer);
  useLayoutEffect(() => {
    current.current = drawer;
  });
  const lastStaged = useRef<string | null>(null);

  // 1 — Keep the editor for the lifetime of this view; changes use the current drawer callback.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        horizontalRule: false,
        underline: false,
        trailingNode: { node: "paragraph", notAfter: ["paragraph"] },
        link: { openOnClick: false, enableClickSelection: true },
      }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      ImageResize.extend({ name: "image" }).configure({ inline: false }),
      // Keep the document node registered; uploads stay disabled without a handler.
      ImageUploadNode.configure({
        accept: "image/png,image/jpeg,image/webp,image/svg+xml",
        maxSize: 5 * 1024 * 1024,
        limit: 1,
      }),
      Typography,
      Underline,
      Selection,
    ],
    content: value ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: true,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Article content",
        class: "qrk-article-editor outline-none",
      },
    },
    onCreate: ({ editor: created }) => {
      lastStaged.current = JSON.stringify(created.getJSON());
    },
    onUpdate: ({ editor: updated }) => {
      const document = updated.getJSON();
      const serialized = JSON.stringify(document);
      if (serialized !== lastStaged.current) {
        lastStaged.current = serialized;
        current.current.onChange(document);
      }
    },
  });

  // 2 — Session echoes never reset the editor. Only genuinely different external content is applied.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const document = value ?? { type: "doc", content: [{ type: "paragraph" }] };
    const incoming = JSON.stringify(document);
    if (incoming === lastStaged.current || incoming === JSON.stringify(editor.getJSON())) return;
    let cancelled = false;
    // React node views may flush while applying content; run after this commit.
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      editor.commands.setContent(document, { emitUpdate: false });
      lastStaged.current = JSON.stringify(editor.getJSON());
    });
    return () => {
      cancelled = true;
    };
  }, [editor, value]);

  if (!editor) return null;
  return (
    <EditorContext.Provider value={{ editor }}>
      <div className="qrk-bricks qrk-article-controls">
        <ArticleToolbar editor={editor} />
      </div>
      <div className="qrk-article-surface qrk-article-writing-column">
        <input
          className="qrk-article-title-input"
          aria-label="Article title"
          placeholder="Title"
          required
          pattern={".*\\S.*"}
          title="Enter a title containing more than whitespace."
          value={title}
          onChange={(event) => drawer.onTitleChange(event.target.value)}
        />
        <input
          className="qrk-article-subtitle-input"
          aria-label="Article subtitle"
          placeholder="Add a subtitle…"
          required
          pattern={".*\\S.*"}
          title="Enter a subtitle containing more than whitespace."
          value={subtitle}
          onChange={(event) => drawer.onSubtitleChange(event.target.value)}
        />
        <div className="qrk-article-document">
          <EditorContent editor={editor} />
        </div>
        <DragHandle editor={editor} nested={false}>
          <div title="Drag block" aria-label="Drag block" className="qrk-article-block-handle">
            <GripVertical size={20} />
          </div>
        </DragHandle>
      </div>
    </EditorContext.Provider>
  );
}
