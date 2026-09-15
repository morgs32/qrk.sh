"use client";

import { useUser } from "@clerk/react";
import Document from "@tiptap/extension-document";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Schema } from "effect";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { usePageStore } from "@/app/[username]/site/[siteId]/page/[pageId]/pageStore";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.String,
});

const ArticleDocument = Document.extend({
  content: "heading block+",
});

export function HeroCopy() {
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const article = usePageStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId]?.article,
  );
  const setArticle = usePageStore((state) => state.setArticle);

  const editor = useEditor(
    {
      extensions: [
        ArticleDocument,
        StarterKit.configure({
          document: false,
        }),
        Placeholder.configure({
          placeholder: "Write something...",
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
      editorProps: {
        attributes: {
          class:
            "hero-article focus:outline-none [&_h1]:text-[clamp(4rem,15vw,10rem)] [&_h1]:font-bold [&_h1]:leading-[1.05] [&_h1]:tracking-tight [&_p]:mt-6 [&_p]:max-w-xs [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground",
        },
      },
    },
    [article === undefined ? "missing" : "ready"],
  );

  if (user === null || user === undefined || article === undefined || editor === null) {
    return null;
  }

  return (
    <div className="min-h-full w-full bg-background px-6 py-16">
      <EditorContent editor={editor} />
    </div>
  );
}
