"use client";

import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react";
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
import { useEffect, useLayoutEffect, useRef, type ContextType } from "react";
import { createPortal } from "react-dom";
import ImageResize from "tiptap-extension-resize-image";

import { TextBrickEditingContext } from "./TextBrickEditingContext";
import { TextToolbar } from "./TextToolbar";
import { HorizontalRule } from "./tiptap/node/horizontal-rule-node/horizontal-rule-node-extension";
import { ImageUploadNode } from "./tiptap/node/image-upload-node/image-upload-node-extension";
import "./text-editor.scss";

export function TextEditorControl(props: {
  value: JSONContent | null;
  editing?: ContextType<typeof TextBrickEditingContext>;
}) {
  const { value, editing = null } = props;
  const current = useRef({ value, editing });
  useLayoutEffect(() => {
    current.current = { value, editing };
  });
  const documentRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const lastStaged = useRef<string | null>(null);
  const failedDocument = useRef<JSONContent | null>(null);
  const wasEditing = useRef(false);
  const isEditing = editing?.isEditing === true && editing.isActive;
  const {
    refs: { setReference, setFloating },
    floatingStyles,
  } = useFloating({
    placement: "top-start",
    strategy: "fixed",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  // 1 — Keep the editor for the lifetime of this view; callbacks read current host capabilities.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
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
      // Tiptap stores this callback; it reads the host only when a file is uploaded.
      // oxlint-disable-next-line react/refs
      ImageUploadNode.configure({
        accept: "image/png,image/jpeg,image/webp,image/svg+xml",
        maxSize: 5 * 1024 * 1024,
        limit: 1,
        upload: (file, onProgress, signal) => {
          const host = current.current.editing;
          if (!host?.isEditing || !host.isActive)
            return Promise.reject(new Error("Text editing has ended"));
          return host.uploadImage(file, onProgress, signal);
        },
        onError: (error) => current.current.editing?.onError(error.message),
      }),
      Typography,
      Underline,
      Selection,
    ],
    content: value ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: isEditing,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Text content",
        class: "qrk-text-editor outline-none",
      },
    },
    onCreate: ({ editor: created }) => {
      lastStaged.current = JSON.stringify(created.getJSON());
    },
    onUpdate: ({ editor: updated }) => {
      const host = current.current.editing;
      if (!updated.isEditable || !host?.isEditing || !host.isActive) return;
      const document = updated.getJSON();
      const serialized = JSON.stringify(document);
      if (serialized === lastStaged.current) {
        failedDocument.current = null;
        return;
      }
      // 2 — Stage immediately; failure keeps the local document available for the next attempt.
      if (host.onDocumentChange(document)) {
        lastStaged.current = serialized;
        failedDocument.current = null;
      } else {
        failedDocument.current = document;
      }
    },
  });

  // 3 — Session echoes never reset the editor. Only genuinely different external content is applied.
  useEffect(() => {
    if (!editor || editor.isDestroyed || failedDocument.current !== null) return;
    const document = value ?? { type: "doc", content: [{ type: "paragraph" }] };
    const incoming = JSON.stringify(document);
    if (incoming === lastStaged.current || incoming === JSON.stringify(editor.getJSON())) return;
    let cancelled = false;
    // React node views may flush while applying content; run after this commit.
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed || failedDocument.current !== null) return;
      editor.commands.setContent(document, { emitUpdate: false });
      lastStaged.current = JSON.stringify(editor.getJSON());
    });
    return () => {
      cancelled = true;
    };
  }, [editor, value]);

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (wasEditing.current && !isEditing && failedDocument.current !== null) {
      if (current.current.editing?.onDocumentChange(failedDocument.current)) {
        lastStaged.current = JSON.stringify(failedDocument.current);
        failedDocument.current = null;
      }
    }
    wasEditing.current = isEditing;
    if (editor.isEditable === isEditing) return;
    let cancelled = false;
    // Image controls capture editability; recreating node views cancels upload requests on exit.
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      editor.setEditable(isEditing, false);
      editor.createNodeViews();
      editor.view.dispatch(editor.state.tr);
      if (isEditing && editor.isEditable) editor.commands.focus();
    });
    return () => {
      cancelled = true;
    };
  }, [editor, isEditing]);

  useLayoutEffect(() => {
    const element = documentRef.current;
    if (!element || !editing?.isActive) return;
    const measure = () => {
      if (element.getClientRects().length === 0 || element.getBoundingClientRect().width <= 0)
        return;
      current.current.editing?.onNaturalHeight(element.getBoundingClientRect().height);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element, { box: "border-box" });
    measure();
    return () => observer.disconnect();
  }, [editor, editing?.isActive, editing?.measurementEpoch]);

  useEffect(() => {
    if (!isEditing || !editor) return;
    function isInside(target: EventTarget | null) {
      return (
        target instanceof Node &&
        (documentRef.current?.contains(target) ||
          toolbarRef.current?.contains(target) ||
          (target instanceof Element &&
            target.closest(
              ".qrk-text-block-handle, .tiptap-popover, .tiptap-dropdown-menu-content, .tiptap-dropdown-menu-sub-content",
            )))
      );
    }
    function leave(event: Event) {
      if (!isInside(event.target)) current.current.editing?.deactivate();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const popoverOpen = document.querySelector(
        ".tiptap-popover[data-state=open], .tiptap-dropdown-menu-content[data-state=open]",
      );
      queueMicrotask(() => {
        if (!event.defaultPrevented && !popoverOpen) current.current.editing?.deactivate();
      });
    }
    // focusin avoids treating a native file picker (which has no DOM focus target) as an exit.
    document.addEventListener("pointerdown", leave);
    document.addEventListener("focusin", leave);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", leave);
      document.removeEventListener("focusin", leave);
      document.removeEventListener("keydown", escape, true);
    };
  }, [editor, isEditing]);

  if (!editor) return null;
  return (
    <EditorContext.Provider value={{ editor }}>
      <div ref={setReference} className="qrk-text-surface">
        <div ref={documentRef} className="qrk-text-document">
          <EditorContent editor={editor} />
        </div>
        {isEditing && (
          <DragHandle editor={editor} nested={false}>
            <div title="Drag block" aria-label="Drag block" className="qrk-text-block-handle">
              <GripVertical size={20} />
            </div>
          </DragHandle>
        )}
      </div>
      {isEditing &&
        createPortal(
          <div
            ref={setFloating}
            style={{ ...floatingStyles, zIndex: 45, maxWidth: "calc(100vw - 16px)" }}
          >
            <div ref={toolbarRef} className="qrk-bricks qrk-text-controls">
              <TextToolbar editor={editor} />
            </div>
          </div>,
          document.body,
        )}
    </EditorContext.Provider>
  );
}
