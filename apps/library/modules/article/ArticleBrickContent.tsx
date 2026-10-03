"use client";

import { generateHTML } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline } from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import ImageResize from "tiptap-extension-resize-image";
import { makeComponentView } from "../../make/makeComponentView";
import { articleBrickComponent } from "./generator/ArticleBrickComponent";
import { BrickShell } from "../../components/brick/BrickShell";
import { HorizontalRule } from "./tiptap/node/horizontal-rule-node/horizontal-rule-node-extension";
import { ImageUploadNode } from "./tiptap/node/image-upload-node/image-upload-node-extension";
import "./article-font.css";
import "./article-editor.scss";

export const articleBrickContentView = makeComponentView(articleBrickComponent, {
  component(props) {
    const { title, subtitle, content } = props;
    const source = JSON.stringify(content ?? { type: "doc", content: [{ type: "paragraph" }] });
    const [rendered, setRendered] = useState<
      { source: string; html: string } | { source: string; error: unknown } | null
    >(null);

    // 1 — Serialize in the browser; server and initial client markup stay identical.
    useEffect(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        try {
          const html = generateHTML(JSON.parse(source), [
            StarterKit.configure({
              heading: { levels: [2, 3, 4] },
              horizontalRule: false,
              underline: false,
              trailingNode: { node: "paragraph", notAfter: ["paragraph"] },
              link: { openOnClick: false, enableClickSelection: true },
            }),
            HorizontalRule,
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            TaskList,
            TaskItem.configure({ nested: true }),
            Highlight.configure({ multicolor: true }),
            ImageResize.extend({ name: "image" }).configure({ inline: false }),
            ImageUploadNode,
            Underline,
          ]);
          const template = document.createElement("template");
          template.innerHTML = html;
          // The image node view reads saved pixel widths; its default serializer does not.
          for (const image of template.content.querySelectorAll("img")) {
            const width = image
              .getAttribute("containerstyle")
              ?.match(/(?:^|;)\s*width:\s*([0-9.]+)px/);
            const container = document.createElement("div");
            if (width) {
              container.style.width = `${width[1]}px`;
              image.setAttribute("width", width[1]);
            }
            image.replaceWith(container);
            container.appendChild(image);
          }
          for (const checkbox of template.content.querySelectorAll("input[type=checkbox]")) {
            checkbox.setAttribute("disabled", "");
          }
          setRendered({ source, html: template.innerHTML });
        } catch (error) {
          setRendered({ source, error });
        }
      });
      return () => {
        cancelled = true;
      };
    }, [source]);

    if (rendered?.source === source && "error" in rendered) throw rendered.error;
    return (
      <BrickShell className="overflow-hidden bg-white">
        <div className="qrk-article-document qrk-article-readonly">
          <h1 className="qrk-article-title">{title}</h1>
          <p className="qrk-article-subtitle">{subtitle}</p>
          <div
            aria-label="Article content"
            className="tiptap ProseMirror qrk-article-editor readonly"
            dangerouslySetInnerHTML={{
              __html: rendered && "html" in rendered ? rendered.html : "",
            }}
          />
        </div>
      </BrickShell>
    );
  },
});
