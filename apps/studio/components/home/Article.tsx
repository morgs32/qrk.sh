"use client";

import { useAuth } from "@clerk/nextjs";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { Typography } from "@tiptap/extension-typography";
import { Underline } from "@tiptap/extension-underline";
import { Selection } from "@tiptap/extensions";
import { EditorContent, EditorContext, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { stageCommand } from "@zerospin/react";
import { ZerospinError } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import ImageResize from "tiptap-extension-resize-image";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { usePageStore } from "@/app/[username]/site/[siteId]/page/[pageId]/pageStore";
import { ArticleToolbar } from "@/components/home/ArticleToolbar";
import { HorizontalRule } from "@/app/tiptap/node/horizontal-rule-node/horizontal-rule-node-extension";
import { ImageUploadNode } from "@/app/tiptap/node/image-upload-node/image-upload-node-extension";
import { userSession } from "@/zerospin/userSession";

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
  pageId: Schema.TemplateLiteral(["pag_", Schema.String]),
});

export function Article() {
  const { getToken } = useAuth();
  const params = useValidatedParams(ParamsSchema);
  const session = userSession;
  const page = usePageStore((state) => state.page);
  const article = page?.id === params.pageId ? page.article : undefined;
  const setArticle = usePageStore((state) => state.setArticle);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          horizontalRule: false,
          trailingNode: {
            node: "paragraph",
            notAfter: ["paragraph"],
          },
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
        // Keep existing article images and upload-node output on the same node type.
        ImageResize.extend({ name: "image" }).configure({
          inline: false,
        }),
        ImageUploadNode.configure({
          accept: "image/png,image/jpeg,image/webp,image/svg+xml",
          maxSize: 5 * 1024 * 1024,
          limit: 1,
          upload: async (file, onProgress, signal) => {
            signal?.throwIfAborted();
            const sessionToken = await getToken();
            signal?.throwIfAborted();
            if (!sessionToken) throw new Error("Sign in to upload images");

            const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
            if (!apiBaseUrl) throw new Error("NEXT_PUBLIC_API_URL is required");

            const formData = new FormData();
            formData.set("file", file);
            formData.set("siteId", params.siteId);

            return new Promise<string>((resolve, reject) => {
              const request = new XMLHttpRequest();
              request.open("POST", `${apiBaseUrl.replace(/\/$/, "")}/upload`);
              request.setRequestHeader("Authorization", `Bearer ${sessionToken}`);
              request.responseType = "json";
              request.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                  onProgress?.({ progress: Math.round((event.loaded / event.total) * 100) });
                }
              };
              request.onload = () => {
                try {
                  if (request.status < 200 || request.status >= 300) {
                    const body = Schema.decodeUnknownSync(
                      Schema.Struct({ message: Schema.String }),
                    )(request.response);
                    reject(new Error(body.message));
                    return;
                  }
                  const body = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))(
                    request.response,
                  );
                  resolve(body.url);
                } catch {
                  reject(new Error(`Upload failed (${request.status}): invalid response`));
                }
              };
              request.onerror = () =>
                reject(new Error("Image upload failed. Check your connection."));
              request.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
              const abort = () => request.abort();
              signal?.addEventListener("abort", abort, { once: true });
              request.onloadend = () => signal?.removeEventListener("abort", abort);
              request.send(formData);
            });
          },
          onError: (error) => toast.error(error.message),
        }),
        Typography,
        Underline,
        Selection,
      ],
      content: article,
      immediatelyRender: false,
      onUpdate: ({ editor: updatedEditor }) => {
        const json = updatedEditor.getJSON();
        setArticle(json);

        const state = session.store.getState();
        if (!state.isInitialized) {
          toast.error("Your session is not ready");
          return;
        }

        const article = Schema.decodeUnknownSync(
          Schema.Struct({
            type: Schema.Literal("doc"),
            content: Schema.optional(Schema.Array(Schema.Unknown)),
            attrs: Schema.optional(Schema.Unknown),
            marks: Schema.optional(Schema.Array(Schema.Unknown)),
            text: Schema.optional(Schema.String),
          }),
        )(json);

        const result = stageCommand({
          session,
          contractName: "updatePageArticle",
          payload: {
            id: params.pageId,
            article,
          },
        });

        if (result._tag === "Failure") {
          toast.error(new ZerospinError(result.failure).message);
        }
      },
      editorProps: {
        attributes: {
          autocomplete: "off",
          autocorrect: "off",
          autocapitalize: "off",
          "aria-label": "Article content",
          class:
            "hero-article simple-editor focus:outline-none [&_h1:first-child]:text-[clamp(4rem,15vw,10rem)] [&_h1:first-child]:font-bold [&_h1:first-child]:leading-[1.05] [&_h1:first-child]:tracking-tight [&_h1:first-child]:mt-0 [&_p]:max-w-xs [&_p]:text-muted-foreground",
        },
      },
    },
    [article === undefined ? "missing" : "ready"],
  );

  if (article === undefined || editor === null) {
    return null;
  }

  return (
    <EditorContext.Provider value={{ editor }}>
      <div className="flex min-h-full w-full flex-col bg-background">
        <ArticleToolbar editor={editor} />
        <div className="w-full px-6 py-16">
          {/* The extension positions the handle and owns native dragging. */}
          <DragHandle editor={editor} nested={false}>
            <div
              title="Drag block"
              aria-label="Drag block"
              className="flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </div>
          </DragHandle>
          <EditorContent editor={editor} />
        </div>
      </div>
    </EditorContext.Provider>
  );
}
