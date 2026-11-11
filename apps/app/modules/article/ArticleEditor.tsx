"use client";

import { MeowdownEditor, type EditorHandle } from "@meowdown/react";
import type { articleV1 } from "@qrk.sh/zerospin/src/modules/article/articleV1";
import type { IResult } from "@zerospin/error";
import type { IInferDecodedRow } from "@zerospin/shapes";
import { isEqual } from "es-toolkit";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWarnBeforeUnload } from "@/lib/useWarnBeforeUnload";
import { BrickShell } from "../components/brick/BrickShell";

import "./article-font.css";
import "./article-editor.css";

export function ArticleEditor(props: {
  state: IInferDecodedRow<typeof articleV1.stateShape> | null;
  onFocus: () => void;
  onSave: (
    state: IInferDecodedRow<typeof articleV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  registerFlush: (flush: () => boolean) => () => void;
}) {
  const { state, onFocus, onSave, registerFlush } = props;
  const savedState = state ?? { title: "", subtitle: "", content: null };
  const [draft, setDraft] = useState<{ state: typeof savedState; bodyChanged: boolean } | null>(
    null,
  );
  // Keep the accepted snapshot visible until the session query echoes it.
  const [staged, setStaged] = useState<typeof savedState | null>(null);
  const editedState = draft?.state ?? staged ?? savedState;
  const [mounted, setMounted] = useState(false);
  const [initialMarkdown] = useState(savedState.content ?? "");
  const editorRef = useRef<EditorHandle>(null);
  // Navigation can request a flush before React commits the latest input event.
  const current = useRef({ draft, staged, savedState, onSave });
  const composing = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const lastAppliedMarkdown = useRef(initialMarkdown);

  useLayoutEffect(() => {
    current.current.savedState = savedState;
    current.current.onSave = onSave;
    if (current.current.staged !== null && isEqual(current.current.staged, savedState)) {
      current.current.staged = null;
      setStaged(null);
    }
  });

  useWarnBeforeUnload(draft !== null);

  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const { draft, staged, savedState, onSave } = current.current;
    if (draft === null) return true;
    const editor = editorRef.current;
    if (composing.current || editor?.editor?.view.composing) return false;

    const previous = staged ?? savedState;
    let nextState = draft.state;
    if (draft.bodyChanged) {
      if (editor === null) return false;
      const markdown = editor.getMarkdown();
      nextState = {
        ...nextState,
        content: markdown === "" && previous.content === null ? null : markdown,
      };
    }

    if (!isEqual(nextState, previous)) {
      if (onSave(nextState)._tag === "Failure") return false;
      current.current.staged = nextState;
      setStaged(nextState);
    }

    lastAppliedMarkdown.current = nextState.content ?? "";
    current.current.draft = null;
    setDraft(null);
    return true;
  }, []);

  useLayoutEffect(() => registerFlush(flush), [flush, registerFlush]);
  useLayoutEffect(() => () => window.clearTimeout(saveTimer.current), []);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [flush]);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 1000);
  }, [flush]);

  const updateDraft = useCallback(
    (fields: { title?: string; subtitle?: string }, bodyChanged = false) => {
      const { draft, staged, savedState } = current.current;
      if (!bodyChanged || !draft?.bodyChanged) {
        const nextDraft = {
          state: { ...(draft?.state ?? staged ?? savedState), ...fields },
          bodyChanged: bodyChanged || draft?.bodyChanged === true,
        };
        current.current.draft = nextDraft;
        setDraft(nextDraft);
      }
      scheduleSave();
    },
    [scheduleSave],
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
    updateDraft({}, true);
  }, [updateDraft]);
  const resolveXPost = useCallback(() => undefined, []);
  const resolveYouTubeVideo = useCallback(() => undefined, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!mounted || editor === null) return;
    editor.editor?.view.dom.setAttribute("aria-label", "Article content");
  }, [mounted]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!mounted || editor === null || draft !== null || staged !== null) return;
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
  }, [draft, mounted, savedState.content, staged]);

  return (
    <BrickShell className="overflow-hidden bg-white">
      <div
        className="qrk-article-writing-column qrk-responsive-insets"
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          if (current.current.draft !== null) scheduleSave();
        }}
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
          onChange={(event) => updateDraft({ title: event.currentTarget.value })}
        />
        <input
          className="qrk-article-subtitle-input"
          autoComplete="off"
          data-1p-ignore="true"
          aria-label="Article subtitle"
          placeholder="Add a subtitle…"
          value={editedState.subtitle}
          onChange={(event) => updateDraft({ subtitle: event.currentTarget.value })}
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
