"use client";

import { useUser } from "@clerk/react";
import Document from "@tiptap/extension-document";
import { FindAndReplace } from "@tiptap/extension-find-and-replace";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TextAlign } from "@tiptap/extension-text-align";
import { Typography } from "@tiptap/extension-typography";
import { Underline } from "@tiptap/extension-underline";
import { Selection } from "@tiptap/extensions";
import { EditorContent, EditorContext, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Schema } from "effect";
import { useEffect, useState } from "react";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { usePageStore } from "@/app/[username]/site/[siteId]/page/[pageId]/pageStore";
import { ArticleToolbar } from "@/components/home/ArticleToolbar";
import { HorizontalRule } from "@/app/tiptap/node/horizontal-rule-node/horizontal-rule-node-extension";
import { ImageUploadNode } from "@/app/tiptap/node/image-upload-node/image-upload-node-extension";
import { handleImageUpload, MAX_FILE_SIZE } from "@/app/tiptap/lib/tiptap-utils";

import "@/app/tiptap/node/blockquote-node/blockquote-node.scss";
import "@/app/tiptap/node/code-block-node/code-block-node.scss";
import "@/app/tiptap/node/horizontal-rule-node/horizontal-rule-node.scss";
import "@/app/tiptap/node/list-node/list-node.scss";
import "@/app/tiptap/node/image-node/image-node.scss";
import "@/app/tiptap/node/heading-node/heading-node.scss";
import "@/app/tiptap/node/paragraph-node/paragraph-node.scss";
import "@/app/tiptap/templates/simple/simple-editor.scss";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.String,
});

const ArticleDocument = Document.extend({
  content: "heading block+",
});

function isSelectionInRequiredHeading(editor: {
  state: {
    selection: { $from: { index: (depth: number) => number } };
    doc: { firstChild: { type: { name: string } } | null };
  };
}): boolean {
  const firstChild = editor.state.doc.firstChild;
  if (firstChild === null || firstChild.type.name !== "heading") {
    return false;
  }
  return editor.state.selection.$from.index(0) === 0;
}

export function Article() {
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const article = usePageStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId]?.article,
  );
  const setArticle = usePageStore((state) => state.setArticle);
  const [inRequiredHeading, setInRequiredHeading] = useState(true);

  const editor = useEditor(
    {
      extensions: [
        ArticleDocument,
        StarterKit.configure({
          document: false,
          horizontalRule: false,
          link: {
            openOnClick: false,
            enableClickSelection: true,
          },
        }),
        Placeholder.configure({
          placeholder: "Write something...",
        }),
        HorizontalRule,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight.configure({ multicolor: true }),
        Image,
        Typography,
        Underline,
        Superscript,
        Subscript,
        Selection,
        FindAndReplace.configure({
          searchDebounceMs: 500,
          injectCSS: false,
        }),
        ImageUploadNode.configure({
          accept: "image/*",
          maxSize: MAX_FILE_SIZE,
          limit: 3,
          upload: handleImageUpload,
          onError: (error) => console.error("Upload failed:", error),
        }),
      ],
      content: article,
      immediatelyRender: false,
      onUpdate: ({ editor: updatedEditor }) => {
        if (user === null || user === undefined) {
          return;
        }
        setArticle(user.id, params.siteId, params.pageId, updatedEditor.getJSON());
      },
      onSelectionUpdate: ({ editor: updatedEditor }) => {
        setInRequiredHeading(isSelectionInRequiredHeading(updatedEditor));
      },
      onCreate: ({ editor: createdEditor }) => {
        setInRequiredHeading(isSelectionInRequiredHeading(createdEditor));
      },
      editorProps: {
        attributes: {
          autocomplete: "off",
          autocorrect: "off",
          autocapitalize: "off",
          "aria-label": "Article content",
          class:
            "hero-article simple-editor focus:outline-none [&_h1:first-child]:text-[clamp(4rem,15vw,10rem)] [&_h1:first-child]:font-bold [&_h1:first-child]:leading-[1.05] [&_h1:first-child]:tracking-tight [&_h1:first-child]:mt-0 [&_p]:mt-6 [&_p]:max-w-xs [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground",
        },
      },
    },
    [article === undefined ? "missing" : "ready"],
  );

  useEffect(() => {
    if (editor === null) {
      return;
    }
    setInRequiredHeading(isSelectionInRequiredHeading(editor));
  }, [editor]);

  if (user === null || user === undefined || article === undefined || editor === null) {
    return null;
  }

  return (
    <EditorContext.Provider value={{ editor }}>
      <div className="flex min-h-full w-full flex-col bg-background">
        <ArticleToolbar editor={editor} inRequiredHeading={inRequiredHeading} />
        <div className="w-full px-6 py-16">
          <EditorContent editor={editor} />
        </div>
      </div>
    </EditorContext.Provider>
  );
}
