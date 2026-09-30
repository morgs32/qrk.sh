"use client";

import { generateHTML } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline } from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import ImageResize from "tiptap-extension-resize-image";
import { makeComponentView } from "../../make/makeComponentView";
import { textBrickComponent } from "./generator/TextBrickComponent";
import { TextBrickEditingContext } from "./TextBrickEditingContext";
import { HorizontalRule } from "./tiptap/node/horizontal-rule-node/horizontal-rule-node-extension";
import { ImageUploadNode } from "./tiptap/node/image-upload-node/image-upload-node-extension";
import "./text-editor.scss";

export const textBrickContentView = makeComponentView(textBrickComponent, {
  component(props) {
    const { content } = props;
    const editing = useContext(TextBrickEditingContext);
    const current = useRef(editing);
    useLayoutEffect(() => {
      current.current = editing;
    });
    const documentRef = useRef<HTMLDivElement>(null);
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

    // 2 — Measure committed markup only, including later image loads and width changes.
    useLayoutEffect(() => {
      const element = documentRef.current;
      if (!element || !editing?.isActive || rendered?.source !== source || !("html" in rendered))
        return;
      const measure = () => {
        if (element.getClientRects().length === 0 || element.getBoundingClientRect().width <= 0)
          return;
        current.current?.onNaturalHeight(element.getBoundingClientRect().height);
      };
      const observer = new ResizeObserver(measure);
      observer.observe(element, { box: "border-box" });
      measure();
      return () => observer.disconnect();
    }, [rendered, source, editing?.isActive, editing?.measurementEpoch]);

    if (rendered?.source === source && "error" in rendered) throw rendered.error;
    return (
      <div className="qrk-text-surface">
        <div ref={documentRef} className="qrk-text-document">
          <div
            aria-label="Text content"
            className="tiptap ProseMirror qrk-text-editor readonly"
            dangerouslySetInnerHTML={{
              __html: rendered && "html" in rendered ? rendered.html : "",
            }}
          />
        </div>
      </div>
    );
  },
});
