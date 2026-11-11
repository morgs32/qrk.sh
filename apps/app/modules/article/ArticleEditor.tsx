"use client";

import { MeowdownEditor, type EditorHandle } from "@meowdown/react";
import type { articleV1 } from "@qrk.sh/zerospin/src/modules/article/articleV1";
import type { IInferDecodedRow } from "@zerospin/shapes";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWarnBeforeUnload } from "@/lib/useWarnBeforeUnload";
import { BrickShell } from "../components/brick/BrickShell";

import "./article-font.css";
import "./article-editor.css";

export function ArticleEditor(props: {
  state: IInferDecodedRow<typeof articleV1.stateShape> | null;
  onFocus: () => void;
}) {
  const { state, onFocus } = props;
  const savedState = state ?? { title: "", subtitle: "", content: null };
  const [draft, setDraft] = useState<IInferDecodedRow<typeof articleV1.stateShape> | null>(null);
  const editedState = draft ?? savedState;
  const [mounted, setMounted] = useState(false);
  const [initialMarkdown] = useState(editedState.content ?? "");
  const editorRef = useRef<EditorHandle>(null);
  const currentSavedState = useRef(savedState);
  const lastAppliedMarkdown = useRef(initialMarkdown);
  useLayoutEffect(() => {
    currentSavedState.current = savedState;
  });

  useWarnBeforeUnload(
    editedState.title !== savedState.title ||
      editedState.subtitle !== savedState.subtitle ||
      editedState.content !== savedState.content,
  );

  // Meowdown requires the DOM. Mount it after hydration.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const handleDocChange = useCallback(() => {
    const editor = editorRef.current;
    if (editor === null) return;
    const content = editor.getMarkdown();
    setDraft((current) => {
      const latest = current ?? currentSavedState.current;
      if (content === (latest.content ?? "")) return current;
      return { ...latest, content };
    });
  }, []);
  const resolveXPost = useCallback(() => undefined, []);
  const resolveYouTubeVideo = useCallback(() => undefined, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!mounted || editor === null) return;
    editor.editor?.view.dom.setAttribute("aria-label", "Article content");
  }, [mounted]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!mounted || editor === null || draft !== null) return;
    const incoming = savedState.content ?? "";
    if (incoming === lastAppliedMarkdown.current || incoming === editor.getMarkdown()) {
      lastAppliedMarkdown.current = incoming;
      return;
    }
    let cancelled = false;
    // React node views may flush while applying saved content.
    queueMicrotask(() => {
      if (cancelled || editorRef.current !== editor) return;
      editor.setMarkdown(incoming);
      lastAppliedMarkdown.current = incoming;
    });
    return () => {
      cancelled = true;
    };
  }, [draft, mounted, savedState.content]);

  return (
    <BrickShell className="overflow-hidden bg-white">
      <div
        className="qrk-article-writing-column qrk-responsive-insets"
        onFocus={(event) => {
          if (
            event.currentTarget.contains(event.target) &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            onFocus();
        }}
      >
        <input
          className="qrk-article-title-input"
          autoComplete="off"
          data-1p-ignore="true"
          aria-label="Article title"
          placeholder="Title"
          value={editedState.title}
          onChange={(event) => {
            const title = event.currentTarget.value;
            setDraft((current) => ({ ...(current ?? savedState), title }));
          }}
        />
        <input
          className="qrk-article-subtitle-input"
          autoComplete="off"
          data-1p-ignore="true"
          aria-label="Article subtitle"
          placeholder="Add a subtitle…"
          value={editedState.subtitle}
          onChange={(event) => {
            const subtitle = event.currentTarget.value;
            setDraft((current) => ({ ...(current ?? savedState), subtitle }));
          }}
        />
        <div
          className="qrk-article-document"
          onDragStartCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDragOverCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "none";
          }}
          onDropCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {mounted && (
            <MeowdownEditor
              initialMarkdown={initialMarkdown}
              blockHandle={false}
              mode="focus"
              handleRef={editorRef}
              onDocChange={handleDocChange}
              editorClassName="qrk-article-editor outline-none"
              wrapperClassName="qrk-article-meowdown"
              placeholder="Start writing…"
              embedPaste={false}
              resolveXPost={resolveXPost}
              resolveYouTubeVideo={resolveYouTubeVideo}
            />
          )}
        </div>
      </div>
    </BrickShell>
  );
}
